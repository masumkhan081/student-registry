import { NextResponse } from "next/server";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { saveGradeSchema } from "@/features/assessments/schema";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  // 1. Enforce Staff session
  const identity = await getDemoIdentity();

  if (!identity) {
    return NextResponse.json(
      { error: "Authentication required. Please select a demo identity." },
      { status: 401 },
    );
  }

  if (identity.role !== "STAFF") {
    return NextResponse.json(
      { error: "Only registry staff are authorized to grade submissions." },
      { status: 403 },
    );
  }

  // 2. Parse & validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const parsed = saveGradeSchema.safeParse(body);
  if (!parsed.success) {
    const firstError =
      parsed.error.issues[0]?.message || "Invalid grade entered.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { id: submissionId } = await params;
  const gradeDecimal = new Prisma.Decimal(parsed.data.grade);

  try {
    const transactionResult = await db.$transaction(async (tx) => {
      // 1. Acquire row-level lock on Submission row to serialize against concurrent file replacement
      const lockedSubmissions = await tx.$queryRaw<
        Array<{ id: string; updatedAt: Date }>
      >`
        SELECT id, "updatedAt" FROM "Submission" WHERE id = ${submissionId} FOR UPDATE
      `;

      if (lockedSubmissions.length === 0) {
        return { status: 404 as const, error: "Submission not found." };
      }

      const lockedSub = lockedSubmissions[0];

      // Stale grading protection: if student resubmitted after staff loaded the form
      if (
        lockedSub.updatedAt.toISOString() !== parsed.data.submissionUpdatedAt
      ) {
        return {
          status: 409 as const,
          error:
            "The student has resubmitted this coursework since you opened the grading form. Please reopen and review the updated submission before grading.",
        };
      }

      // Check if result already exists for this submission
      const existingResult = await tx.result.findUnique({
        where: { submissionId },
      });

      // Save grade
      if (existingResult) {
        // 2. Acquire row-level lock on Result row
        const lockedResults = await tx.$queryRaw<
          Array<{
            id: string;
            grade: Prisma.Decimal;
            publishedAt: Date | null;
            updatedAt: Date;
          }>
        >`
          SELECT id, grade, "publishedAt", "updatedAt" FROM "Result" WHERE id = ${existingResult.id} FOR UPDATE
        `;

        if (lockedResults.length === 0) {
          return { status: 404 as const, error: "Result not found." };
        }

        const lockedRes = lockedResults[0];

        // Stale result check: if grade was modified concurrently by another staff action
        if (
          parsed.data.expectedResultUpdatedAt &&
          lockedRes.updatedAt.toISOString() !== parsed.data.expectedResultUpdatedAt
        ) {
          return {
            status: 409 as const,
            error:
              "The grade has been modified by another action. Please reopen the submission to view latest values.",
          };
        }

        // An unchanged save preserves publication state; changing a published grade withholds it again
        const isSameGrade = new Prisma.Decimal(lockedRes.grade).equals(
          gradeDecimal,
        );
        const newPublishedAt = isSameGrade ? lockedRes.publishedAt : null;

        const updatedResult = await tx.result.update({
          where: { id: lockedRes.id },
          data: {
            grade: gradeDecimal,
            publishedAt: newPublishedAt,
          },
        });

        return { status: 200 as const, result: updatedResult };
      }

      // New grade: always saved as withheld (publishedAt = null)
      const createdResult = await tx.result.create({
        data: {
          submissionId: lockedSub.id,
          grade: gradeDecimal,
          publishedAt: null,
        },
      });

      return { status: 200 as const, result: createdResult };
    });

    if (transactionResult.status !== 200) {
      return NextResponse.json(
        { error: transactionResult.error },
        { status: transactionResult.status },
      );
    }

    const { result } = transactionResult;
    return NextResponse.json({
      success: true,
      result: {
        id: result.id,
        grade: result.grade.toFixed(2),
        publishedAt: result.publishedAt ? result.publishedAt.toISOString() : null,
        updatedAt: result.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while saving the grade.",
      },
      { status: 500 },
    );
  }
}
