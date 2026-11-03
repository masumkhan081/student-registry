import { NextResponse } from "next/server";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import { createSignedDownloadUrl } from "@/lib/storage";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  // 1. Authenticate server session
  const identity = await getDemoIdentity();

  if (!identity) {
    return NextResponse.json(
      { error: "Authentication required. Please select a demo identity." },
      { status: 401 },
    );
  }

  const { id: assessmentId } = await params;

  if (identity.role === "STUDENT") {
    // 2. Resolve student
    const student = await db.student.findUnique({
      where: { id: identity.studentId },
      select: {
        id: true,
        programmeId: true,
        academicYear: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student record not found." },
        { status: 403 },
      );
    }

    // 3. Resolve assessment & verify cohort
    const assessment = await db.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        programmeId: true,
        academicYear: true,
      },
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "Assessment not found." },
        { status: 404 },
      );
    }

    if (
      student.programmeId !== assessment.programmeId ||
      student.academicYear !== assessment.academicYear
    ) {
      return NextResponse.json(
        {
          error:
            "You are not enrolled in the cohort for this assessment.",
        },
        { status: 403 },
      );
    }

    // 4. Resolve own submission
    const submission = await db.submission.findUnique({
      where: {
        studentId_assessmentId: {
          studentId: student.id,
          assessmentId: assessment.id,
        },
      },
      select: {
        storagePath: true,
        originalFilename: true,
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "No submission found for this assessment." },
        { status: 404 },
      );
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

  if (identity.role === "STAFF") {
    const url = new URL(request.url);
    const targetStudentId = url.searchParams.get("studentId");

    let submission;
    if (targetStudentId) {
      submission = await db.submission.findUnique({
        where: {
          studentId_assessmentId: {
            studentId: targetStudentId,
            assessmentId,
          },
        },
        select: {
          storagePath: true,
          originalFilename: true,
        },
      });
    } else {
      submission = await db.submission.findFirst({
        where: { assessmentId },
        select: {
          storagePath: true,
          originalFilename: true,
        },
      });
    }

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found." },
        { status: 404 },
      );
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

  return NextResponse.json({ error: "Unauthorized role." }, { status: 403 });
}
