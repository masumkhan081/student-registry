import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  inspectAndValidateStoredFile,
  deleteStorageObject,
} from "@/lib/storage";
import { isSubmissionLate } from "@/features/assessments/format";

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

  // 5. Parse and validate request body with Zod before ANY privileged Storage read or delete
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const submitBodySchema = z.object({
    storagePath: z
      .string()
      .trim()
      .regex(
        new RegExp(
          `^submissions\\/${student.id}\\/${assessment.id}\\/\\d+-[0-9a-fA-F-]+\\.(pdf|docx)$`,
        ),
        "Invalid or non-canonical storage path.",
      ),
    originalFilename: z
      .string()
      .trim()
      .min(1, "Filename is required.")
      .max(255, "Filename is too long."),
  });

  const parsed = submitBodySchema.safeParse(body);
  if (!parsed.success) {
    const firstError =
      parsed.error.issues[0]?.message || "Invalid submission parameters.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { storagePath, originalFilename } = parsed.data;
  const sanitizedFilename = originalFilename.replace(/[/\\]/g, "");

  // 6. Fast idempotent retry check: if this exact object path is already the active submission,
  // return success immediately without modifying records, wiping grades, or re-inspecting storage.
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

  if (existingSubmission && existingSubmission.storagePath === storagePath) {
    const isLate = isSubmissionLate(
      existingSubmission.submittedAt,
      assessment.deadline,
    );
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

  // 7. Verify uploaded candidate object in Storage: existence, size <= 10 MiB, real magic bytes
  const inspection = await inspectAndValidateStoredFile(storagePath);
  if (!inspection.isValid) {
    await deleteStorageObject(storagePath);
    return NextResponse.json(
      { error: inspection.error },
      { status: 400 },
    );
  }

  // 8. Database transaction: concurrency-safe row lock and atomic write
  let oldStoragePathToDelete: string | null = null;

  try {
    const { submission } = await db.$transaction(async (tx) => {
      // Row-level lock on Submission to serialize concurrent replacement and grading
      const lockedRows = await tx.$queryRaw<
        Array<{ id: string; storagePath: string; updatedAt: Date }>
      >`
        SELECT id, "storagePath", "updatedAt" FROM "Submission"
        WHERE "studentId" = ${student.id} AND "assessmentId" = ${assessment.id}
        FOR UPDATE
      `;

      // Re-evaluate server write time at the final write decision inside the transaction
      const writeTime = new Date();

      if (lockedRows.length > 0) {
        const current = lockedRows[0];

        // Case A: Concurrent identical retry that committed while we waited
        if (current.storagePath === storagePath) {
          const active = await tx.submission.findUniqueOrThrow({
            where: { id: current.id },
          });
          return { submission: active, isIdempotent: true };
        }

        // Case B: A different file exists - check if replacing after deadline
        if (writeTime.getTime() >= assessment.deadline.getTime()) {
          throw new Error("REPLACEMENT_AFTER_DEADLINE");
        }

        oldStoragePathToDelete = current.storagePath;

        // Valid replacement strictly before deadline: remove existing Result in same transaction
        await tx.result.deleteMany({
          where: { submissionId: current.id },
        });

        const updated = await tx.submission.update({
          where: { id: current.id },
          data: {
            storagePath,
            originalFilename: sanitizedFilename,
            size: inspection.size,
            submittedAt: writeTime,
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
          submittedAt: writeTime,
        },
      });

      return { submission: created, isIdempotent: false };
    });

    // 9. Post-commit cleanup: remove superseded file from storage
    if (oldStoragePathToDelete && oldStoragePathToDelete !== storagePath) {
      await deleteStorageObject(oldStoragePathToDelete);
    }

    const isLate = isSubmissionLate(
      submission.submittedAt,
      assessment.deadline,
    );

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
    // Clean up uploaded candidate file so failed transactions do not leave orphan storage
    await deleteStorageObject(storagePath);

    if (
      dbError instanceof Error &&
      dbError.message === "REPLACEMENT_AFTER_DEADLINE"
    ) {
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
        const isLate = isSubmissionLate(
          racingSub.submittedAt,
          assessment.deadline,
        );
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

      return NextResponse.json(
        {
          error:
            "Submissions are closed. Replacements are not permitted after the deadline.",
        },
        { status: 400 },
      );
    }

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
