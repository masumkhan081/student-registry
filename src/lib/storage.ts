import "server-only";

import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB = 10,485,760 bytes
const DEFAULT_BUCKET = "sms";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing Supabase configuration. SUPABASE_URL and SUPABASE_SECRET_KEY must be set.",
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export function getStorageBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
}

export type FileValidationResult =
  | {
      isValid: true;
      format: "PDF" | "DOCX";
      size: number;
      mimeType:
        | "application/pdf"
        | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  | {
      isValid: false;
      error: string;
      size?: number;
    };

/**
 * Inspects ZIP directory entries and [Content_Types].xml to verify whether
 * this archive is a genuine Microsoft Word (.docx) document.
 * Requires:
 * 1. The Word document part (word/document.xml).
 * 2. [Content_Types].xml containing the DOCX main document content type:
 *    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
 */
export function validateDocxArchive(buf: Buffer): {
  isValid: boolean;
  error?: string;
} {
  if (
    buf.length < 22 ||
    buf[0] !== 0x50 ||
    buf[1] !== 0x4b ||
    buf[2] !== 0x03 ||
    buf[3] !== 0x04
  ) {
    return {
      isValid: false,
      error: "The uploaded file is not a valid ZIP archive.",
    };
  }

  // 1. Locate End of Central Directory (EOCD)
  let eocdOffset = -1;
  const maxSearch = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= maxSearch; i--) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x05 &&
      buf[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  type EntryRecord = {
    method: number;
    compSize: number;
    uncompSize: number;
    localOffset: number;
  };

  const entries: Map<string, EntryRecord> = new Map();

  if (eocdOffset !== -1) {
    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    let curr = cdOffset;

    for (let i = 0; i < totalEntries && curr + 46 <= buf.length; i++) {
      if (
        buf[curr] !== 0x50 ||
        buf[curr + 1] !== 0x4b ||
        buf[curr + 2] !== 0x01 ||
        buf[curr + 3] !== 0x02
      ) {
        break;
      }
      const method = buf.readUInt16LE(curr + 10);
      const compSize = buf.readUInt32LE(curr + 20);
      const uncompSize = buf.readUInt32LE(curr + 24);
      const nameLen = buf.readUInt16LE(curr + 28);
      const extraLen = buf.readUInt16LE(curr + 30);
      const commentLen = buf.readUInt16LE(curr + 32);
      const localOffset = buf.readUInt32LE(curr + 42);

      const name = buf
        .subarray(curr + 46, curr + 46 + nameLen)
        .toString("utf-8");
      entries.set(name, { method, compSize, uncompSize, localOffset });

      curr += 46 + nameLen + extraLen + commentLen;
    }
  } else {
    // Fallback: scan local headers
    let i = 0;
    while (i < buf.length - 30) {
      if (
        buf[i] === 0x50 &&
        buf[i + 1] === 0x4b &&
        buf[i + 2] === 0x03 &&
        buf[i + 3] === 0x04
      ) {
        const method = buf.readUInt16LE(i + 8);
        const compSize = buf.readUInt32LE(i + 18);
        const uncompSize = buf.readUInt32LE(i + 22);
        const nameLen = buf.readUInt16LE(i + 26);
        const extraLen = buf.readUInt16LE(i + 28);
        const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf-8");
        entries.set(name, { method, compSize, uncompSize, localOffset: i });
        if (compSize > 0) {
          i += 30 + nameLen + extraLen + compSize;
        } else {
          i += 30 + nameLen + extraLen;
        }
      } else {
        i++;
      }
    }
  }

  // Check 1: Must contain Word document part (word/document.xml)
  if (!entries.has("word/document.xml")) {
    return {
      isValid: false,
      error:
        "The uploaded file is missing the required Word document part (word/document.xml).",
    };
  }

  // Check 2: Must contain [Content_Types].xml
  const contentTypesEntry = entries.get("[Content_Types].xml");
  if (!contentTypesEntry) {
    return {
      isValid: false,
      error: "The uploaded file is missing [Content_Types].xml.",
    };
  }

  // Check 3: Extract and inspect [Content_Types].xml for DOCX main document content type
  let contentTypesText = "";
  try {
    const lo = contentTypesEntry.localOffset;
    if (lo + 30 <= buf.length) {
      const fnLen = buf.readUInt16LE(lo + 26);
      const exLen = buf.readUInt16LE(lo + 28);
      const dataStart = lo + 30 + fnLen + exLen;
      const dataEnd = dataStart + contentTypesEntry.compSize;
      const rawData = buf.subarray(dataStart, dataEnd);

      if (contentTypesEntry.method === 0) {
        contentTypesText = rawData.toString("utf-8");
      } else if (contentTypesEntry.method === 8) {
        contentTypesText = inflateRawSync(rawData).toString("utf-8");
      }
    }
  } catch (err: unknown) {
    return {
      isValid: false,
      error: `Failed to decompress [Content_Types].xml: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const docxMainContentType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  if (!contentTypesText.includes(docxMainContentType)) {
    return {
      isValid: false,
      error:
        "The package [Content_Types].xml does not define the DOCX main document content type.",
    };
  }

  return { isValid: true };
}

/**
 * Backwards compatibility helper for checkDocxZipContents.
 */
export function checkDocxZipContents(buf: Buffer): boolean {
  return validateDocxArchive(buf).isValid;
}

/**
 * Validates file buffer length and magic bytes.
 * Requires genuine PDF (%PDF-) or genuine Word DOCX (with word/document.xml and main document content type).
 */
export function validateFileBuffer(buffer: Buffer): FileValidationResult {
  const size = buffer.length;

  if (size === 0) {
    return {
      isValid: false,
      error: "The uploaded file is empty. Please choose a non-empty document.",
      size: 0,
    };
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `The uploaded file exceeds the 10 MiB size limit (actual: ${(size / (1024 * 1024)).toFixed(2)} MiB).`,
      size,
    };
  }

  // Check PDF (%PDF-)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return {
      isValid: true,
      format: "PDF",
      size,
      mimeType: "application/pdf",
    };
  }

  // Check DOCX (ZIP PK\x03\x04 containing word/document.xml and DOCX content type in [Content_Types].xml)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    const docxResult = validateDocxArchive(buffer);
    if (docxResult.isValid) {
      return {
        isValid: true,
        format: "DOCX",
        size,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }

    return {
      isValid: false,
      size,
      error:
        docxResult.error ||
        "The uploaded file is not a valid Microsoft Word (.docx) document.",
    };
  }

  return {
    isValid: false,
    size,
    error:
      "Invalid file format. Only valid PDF (%PDF-) or Microsoft Word (.docx) documents are accepted.",
  };
}

/**
 * Creates a signed upload URL allowing the client browser to PUT the file directly into private Storage.
 */
export async function createSignedUploadUrl(
  storagePath: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const client = getSupabaseServerClient();
  const bucket = getStorageBucketName();

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(
      `Failed to create signed upload URL: ${error?.message || "Unknown storage error"}`,
    );
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  };
}

/**
 * Downloads an object buffer directly from private Storage.
 */
export async function downloadStorageObjectBuffer(
  storagePath: string,
): Promise<Buffer | null> {
  const client = getSupabaseServerClient();
  const bucket = getStorageBucketName();

  const { data, error } = await client.storage.from(bucket).download(storagePath);

  if (error || !data) {
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Inspects and validates an object currently in private Storage.
 * Verifies existence, file size <= 10 MiB, and valid magic bytes.
 */
export async function inspectAndValidateStoredFile(
  storagePath: string,
): Promise<FileValidationResult> {
  const buffer = await downloadStorageObjectBuffer(storagePath);

  if (!buffer) {
    return {
      isValid: false,
      error: "Uploaded object was not found in storage.",
    };
  }

  return validateFileBuffer(buffer);
}

/**
 * Generates a short-lived signed download URL (default 60 seconds).
 */
export async function createSignedDownloadUrl(
  storagePath: string,
  options?: { expiresInSeconds?: number; downloadFilename?: string },
): Promise<string> {
  const client = getSupabaseServerClient();
  const bucket = getStorageBucketName();
  const expiresIn = options?.expiresInSeconds ?? 60;

  const { data, error } = await client.storage.from(bucket).createSignedUrl(
    storagePath,
    expiresIn,
    options?.downloadFilename
      ? { download: options.downloadFilename }
      : undefined,
  );

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed download URL: ${error?.message || "Unknown storage error"}`,
    );
  }

  return data.signedUrl;
}

/**
 * Safely deletes an object from private Storage (e.g. on failed validation or superseded file).
 */
export async function deleteStorageObject(storagePath: string): Promise<boolean> {
  try {
    const client = getSupabaseServerClient();
    const bucket = getStorageBucketName();

    const { error } = await client.storage.from(bucket).remove([storagePath]);
    return !error;
  } catch {
    return false;
  }
}
