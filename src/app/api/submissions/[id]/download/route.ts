import { NextResponse } from "next/server";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import { createSignedDownloadUrl } from "@/lib/storage";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  // 1. Authenticate server session
  const identity = await getDemoIdentity();

  if (!identity) {
    return NextResponse.json(
      { error: "Authentication required. Please select a demo identity." },
      { status: 401 },
    );
  }

  const { id: submissionId } = await params;

  // 2. Fetch submission record
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      studentId: true,
      storagePath: true,
      originalFilename: true,
    },
  });

  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 },
    );
  }

  // 3. Authorization: Staff or owning Student only
  if (identity.role === "STUDENT") {
    if (submission.studentId !== identity.studentId) {
      return NextResponse.json(
        { error: "You are not authorized to download this submission." },
        { status: 403 },
      );
    }
  }

  try {
    const signedDownloadUrl = await createSignedDownloadUrl(
      submission.storagePath,
      {
        expiresInSeconds: 60,
        downloadFilename: submission.originalFilename,
      },
    );

    return NextResponse.redirect(signedDownloadUrl, 302);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Storage error";
    return NextResponse.json(
      { error: `Unable to generate download URL: ${message}` },
      { status: 500 },
    );
  }
}
