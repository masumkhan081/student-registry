import { NextResponse } from "next/server";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  inspectAndValidateStoredFile,
  deleteStorageObject,
} from "@/lib/storage";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  // 1. Authenticate server session
  const identity = await getDemoIdentity();

  if (!identity) {
    return NextResponse.json(
      { error: "Authentication required. Please select a demo identity." },
      { status: 401 },
    );
  }

  if (identity.role !== "STUDENT") {
    return NextResponse.json(
      { error: "Only students are permitted to submit assessment coursework." },
      { status: 403 },
    );
  }

  // 2. Resolve student from server session
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

  // 3. Resolve assessment
  const { id: assessmentId } = await params;
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      programmeId: true,
      academicYear: true,
      deadline: true,
    },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: "Assessment not found." },
      { status: 404 },
    );
  }

  // 4. Verify cohort matching BOTH programme and academic year
  if (
    student.programmeId !== assessment.programmeId ||
    student.academicYear !== assessment.academicYear
  ) {
    return NextResponse.json(
      {
        error:
          "You are not enrolled in the programme and academic year cohort for this assessment.",
      },
      { status: 403 },
    );
  }

  // 5. Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const { storagePath, originalFilename } = body as {
    storagePath?: string;
    originalFilename?: string;
  };

  if (!storagePath || typeof storagePath !== "string") {
    return NextResponse.json(
      { error: "storagePath is required." },
      { status: 400 },
    );
  }

  // Never trust a path supplied from the browser that does not belong to this student & assessment
  const expectedPrefix = `submissions/${student.id}/${assessment.id}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: "Unauthorized or invalid storage path." },
      { status: 403 },
    );
  }

  const sanitizedFilename = (originalFilename || "submission.pdf")
    .trim()
    .replace(/[/\\]/g, "")
    .slice(0, 255);

  if (!sanitizedFilename) {
    return NextResponse.json(
      { error: "Filename is required." },
      { status: 400 },
    );
  }

  // 6. Check existing submission & deadline rules
  const now = new Date();
  const existingSubmission = await db.submission.findUnique({
    where: {
      studentId_assessmentId: {
        studentId: student.id,
        assessmentId: assessment.id,
      },
    },
    include: {
      result: true,
    },
  });

  // Idempotent retry: if this exact object path is already the active submission,
  // return success immediately without modifying records, wiping grades, or deleting storage.
  if (existingSubmission && existingSubmission.storagePath === storagePath) {
    const isLate =
      existingSubmission.submittedAt.getTime() > assessment.deadline.getTime();
    return NextResponse.json(
      {
        success: true,
        submission: {
          id: existingSubmission.id,
          originalFilename: existingSubmission.originalFilename,
          submittedAt: existingSubmission.submittedAt.toISOString(),
          size: existingSubmission.size,
          isLate,
        },
      },
      { status: 200 },
    );
  }

  // Replacements with a different file are allowed strictly before the deadline
  if (existingSubmission && now.getTime() >= assessment.deadline.getTime()) {
    await deleteStorageObject(storagePath);
    return NextResponse.json(
      {
        error:
          "Submissions are closed. Replacements are not permitted after the deadline.",
      },
      { status: 400 },
    );
  }

  // 7. Verify uploaded object in Storage: existence, size <= 10 MiB, real magic bytes
  const inspection = await inspectAndValidateStoredFile(storagePath);
  if (!inspection.isValid) {
    await deleteStorageObject(storagePath);
    return NextResponse.json(
      { error: inspection.error },
      { status: 400 },
    );
  }

  // 8. Database transaction: concurrency-safe single row per student/assessment
  let oldStoragePathToDelete: string | null = null;

  try {
    const { submission } = await db.$transaction(async (tx) => {
      // Re-query inside transaction to protect against concurrent racing requests
      const current = await tx.submission.findUnique({
        where: {
          studentId_assessmentId: {
            studentId: student.id,
            assessmentId: assessment.id,
          },
        },
        include: {
          result: true,
        },
      });

      if (current) {
        // Case A: Concurrent identical retry that already committed
        if (current.storagePath === storagePath) {
          return { submission: current, isIdempotent: true };
        }

        // Case B: A different file exists - check if replacing after deadline
        if (now.getTime() >= assessment.deadline.getTime()) {
          throw new Error("REPLACEMENT_AFTER_DEADLINE");
        }

        oldStoragePathToDelete = current.storagePath;

        // Valid replacement before deadline: remove existing Result in same transaction
        if (current.result) {
          await tx.result.delete({
            where: { id: current.result.id },
          });
        }

        const updated = await tx.submission.update({
          where: { id: current.id },
          data: {
            storagePath,
            originalFilename: sanitizedFilename,
            size: inspection.size,
            submittedAt: now,
          },
        });

        return { submission: updated, isIdempotent: false };
      }

      // Case C: First submission
      const created = await tx.submission.create({
        data: {
          studentId: student.id,
          assessmentId: assessment.id,
          storagePath,
          originalFilename: sanitizedFilename,
          size: inspection.size,
          submittedAt: now,
        },
      });

      return { submission: created, isIdempotent: false };
    });

    // 9. Post-commit cleanup: remove superseded file from storage
    if (oldStoragePathToDelete && oldStoragePathToDelete !== storagePath) {
      await deleteStorageObject(oldStoragePathToDelete);
    }

    const isLate =
      submission.submittedAt.getTime() > assessment.deadline.getTime();

    return NextResponse.json(
      {
        success: true,
        submission: {
          id: submission.id,
          originalFilename: submission.originalFilename,
          submittedAt: submission.submittedAt.toISOString(),
          size: submission.size,
          isLate,
        },
      },
      { status: existingSubmission ? 200 : 201 },
    );
  } catch (dbError: unknown) {
    if (
      dbError instanceof Error &&
      dbError.message === "REPLACEMENT_AFTER_DEADLINE"
    ) {
      await deleteStorageObject(storagePath);
      return NextResponse.json(
        {
          error:
            "Submissions are closed. Replacements are not permitted after the deadline.",
        },
        { status: 400 },
      );
    }

    // Handle concurrent racing insert (Prisma P2002 unique constraint)
    if (
      typeof dbError === "object" &&
      dbError !== null &&
      "code" in dbError &&
      (dbError as { code: unknown }).code === "P2002"
    ) {
      const racingSub = await db.submission.findUnique({
        where: {
          studentId_assessmentId: {
            studentId: student.id,
            assessmentId: assessment.id,
          },
        },
      });

      if (racingSub && racingSub.storagePath === storagePath) {
        const isLate =
          racingSub.submittedAt.getTime() > assessment.deadline.getTime();
        return NextResponse.json(
          {
            success: true,
            submission: {
              id: racingSub.id,
              originalFilename: racingSub.originalFilename,
              submittedAt: racingSub.submittedAt.toISOString(),
              size: racingSub.size,
              isLate,
            },
          },
          { status: 200 },
        );
      }

      await deleteStorageObject(storagePath);
      return NextResponse.json(
        {
          error:
            now.getTime() >= assessment.deadline.getTime()
              ? "Submissions are closed. Replacements are not permitted after the deadline."
              : "A conflicting submission was processed concurrently. Please try again.",
        },
        { status: 400 },
      );
    }

    // If any other error occurs, clean up the newly uploaded file to avoid orphaned storage
    await deleteStorageObject(storagePath);

    return NextResponse.json(
      {
        error:
          dbError instanceof Error
            ? dbError.message
            : "An unexpected error occurred while saving your submission.",
      },
      { status: 500 },
    );
  }
}
