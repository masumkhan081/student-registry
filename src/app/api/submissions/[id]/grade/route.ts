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
      // Fetch submission inside write transaction
      const submission = await tx.submission.findUnique({
        where: { id: submissionId },
        include: { result: true },
      });

      if (!submission) {
        return { status: 404 as const, error: "Submission not found." };
      }

      // Stale grading protection: if student resubmitted after staff loaded the form
      if (
        submission.updatedAt.toISOString() !== parsed.data.submissionUpdatedAt
      ) {
        return {
          status: 409 as const,
          error:
            "The student has resubmitted this coursework since you opened the grading form. Please reopen and review the updated submission before grading.",
        };
      }

      // Save grade
      if (submission.result) {
        // An unchanged save preserves publication state; changing a published grade withholds it again
        const isSameGrade = submission.result.grade.equals(gradeDecimal);
        const newPublishedAt = isSameGrade
          ? submission.result.publishedAt
          : null;

        const updatedResult = await tx.result.update({
          where: { id: submission.result.id },
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
          submissionId: submission.id,
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
