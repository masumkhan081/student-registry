"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatUtcDateTimeDisplay, isPastDeadline } from "./format";

type SubmissionModalProps = {
  assessment: {
    id: string;
    title: string;
    module: string;
    deadline: string | Date;
  };
  isReplacement: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSubmission: {
    id: string;
    originalFilename: string;
    submittedAt: string;
    size: number;
    isLate: boolean;
  }) => void;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB

export function SubmissionModal({
  assessment,
  isReplacement,
  isOpen,
  onClose,
  onSuccess,
}: SubmissionModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const deadlinePassed = isPastDeadline(assessment.deadline);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    setServerError(null);

    const file = e.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith(".pdf");
    const isDocx = lowerName.endsWith(".docx");

    if (!isPdf && !isDocx) {
      setClientError(
        "Invalid file format. Please select a valid PDF (.pdf) or Microsoft Word (.docx) document.",
      );
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      setClientError("The selected file is empty. Please select a non-empty document.");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setClientError(
        `The selected file exceeds the 10 MiB limit (selected: ${(file.size / (1024 * 1024)).toFixed(2)} MiB). Please choose a smaller file.`,
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedFile) {
      setClientError("Please select a file to submit.");
      return;
    }

    setIsSubmitting(true);
    setServerError(null);
    setClientError(null);

    try {
      // Step 1: Request upload intent & signed upload URL from server
      setStatusText("Authorising upload...");
      const intentRes = await fetch(
        `/api/assessments/${assessment.id}/upload-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: selectedFile.name }),
        },
      );

      const intentData = await intentRes.json();

      if (!intentRes.ok) {
        setServerError(
          intentData.error || "Failed to authorise upload. Please try again.",
        );
        setIsSubmitting(false);
        setStatusText(null);
        return;
      }

      const { uploadUrl, storagePath } = intentData as {
        uploadUrl: string;
        storagePath: string;
      };

      // Step 2: Upload file directly to Supabase private Storage via signed URL
      setStatusText("Uploading document to private storage...");
      const contentType =
        selectedFile.type ||
        (selectedFile.name.toLowerCase().endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf");

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        let uploadErrorMsg = "Failed to upload document to storage.";
        try {
          const uploadErr = await uploadRes.json();
          if (uploadErr.message) {
            uploadErrorMsg = uploadErr.message;
          }
        } catch {
          // ignore parsing error
        }
        setServerError(uploadErrorMsg);
        setIsSubmitting(false);
        setStatusText(null);
        return;
      }

      // Step 3: Finalise submission on server (verifies magic bytes, size, and records in database)
      setStatusText("Verifying document and recording submission...");
      const submitRes = await fetch(`/api/assessments/${assessment.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          originalFilename: selectedFile.name,
        }),
      });

      const submitData = await submitRes.json();

      if (!submitRes.ok) {
        setServerError(
          submitData.error ||
            "Verification failed. The uploaded file was rejected.",
        );
        setIsSubmitting(false);
        setStatusText(null);
        return;
      }

      // Success: Clear the file input and notify parent
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectedFile(null);
      setIsSubmitting(false);
      setStatusText(null);

      onSuccess(submitData.submission);
      router.refresh();
      onClose();
    } catch (err: unknown) {
      setServerError(
        err instanceof Error
          ? err.message
          : "A network error occurred. Please check your connection.",
      );
      setIsSubmitting(false);
      setStatusText(null);
    }
  }

  function handleCancel() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSelectedFile(null);
    setClientError(null);
    setServerError(null);
    setStatusText(null);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="submission-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-900/10 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="submission-modal-title"
              className="text-xl font-bold tracking-tight text-slate-900"
            >
              {isReplacement ? "Replace submission" : "Submit coursework"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">
                {assessment.title}
              </span>{" "}
              ({assessment.module})
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-900"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Deadline Notice */}
        <div className="mt-4 rounded-lg bg-slate-50 p-3.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
          <p>
            <span className="font-semibold text-slate-700">Deadline:</span>{" "}
            {formatUtcDateTimeDisplay(assessment.deadline)}
          </p>
          {deadlinePassed && (
            <p className="mt-1 font-medium text-amber-700">
              ⚠️ The deadline has passed. Your first submission will be accepted
              and flagged as <span className="font-bold">Late</span>.
            </p>
          )}
          {isReplacement && (
            <p className="mt-1 text-slate-500">
              ℹ️ Uploading a new file will replace your existing file. Any
              previous grade or feedback will be reset.
            </p>
          )}
        </div>

        {/* Server or Client Error Alert */}
        {(serverError || clientError) && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <p className="font-semibold text-rose-900">Submission failed</p>
            <p className="mt-1">{serverError || clientError}</p>
            {isReplacement && (
              <p className="mt-2 text-xs text-rose-700">
                Your previous successful submission remains preserved.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* File Picker with format & size instructions */}
          <div>
            <label
              htmlFor="assessment-file-input"
              className="block text-sm font-semibold text-slate-900"
            >
              Choose document
            </label>
            <p id="file-hints" className="mt-1 text-xs text-slate-500">
              Accepted formats: <span className="font-medium">PDF (.pdf)</span>{" "}
              or <span className="font-medium">Word (.docx)</span>. Maximum file
              size: <span className="font-medium">10 MiB</span>.
            </p>

            <div className="mt-2">
              <input
                ref={fileInputRef}
                id="assessment-file-input"
                name="file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                aria-describedby="file-hints"
                onChange={handleFileChange}
                disabled={isSubmitting}
                className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 focus:outline-none file:cursor-pointer disabled:opacity-50"
              />
            </div>

            {selectedFile && !clientError && (
              <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded-md p-2 ring-1 ring-inset ring-slate-200">
                <span className="truncate font-medium text-slate-800">
                  📄 {selectedFile.name}
                </span>
                <span className="shrink-0 text-slate-500 font-mono">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            )}
          </div>

          {/* Status feedback */}
          {statusText && (
            <div
              role="status"
              className="flex items-center gap-2 text-xs font-medium text-slate-600 animate-pulse"
            >
              <div className="h-2 w-2 rounded-full bg-slate-600"></div>
              <span>{statusText}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedFile || Boolean(clientError)}
              className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? "Submitting..."
                : isReplacement
                  ? "Replace file"
                  : "Submit work"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
