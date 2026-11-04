import { NextResponse } from "next/server";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { publishGradeSchema } from "@/features/assessments/schema";

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
      { error: "Only registry staff are authorized to publish grades." },
      { status: 403 },
    );
  }

  // 2. Parse request body
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const parsed = publishGradeSchema.safeParse(body);
  if (!parsed.success) {
    const firstError =
      parsed.error.issues[0]?.message || "Invalid publication parameters.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { id: submissionId } = await params;

  try {
    const transactionResult = await db.$transaction(async (tx) => {
      const submission = await tx.submission.findUnique({
        where: { id: submissionId },
        select: { id: true, result: { select: { id: true } } },
      });

      if (!submission) {
        return { status: 404 as const, error: "Submission not found." };
      }

      if (!submission.result) {
        return {
          status: 400 as const,
          error:
            "Cannot publish an ungraded submission. Please assign a grade first.",
        };
      }

      // 1. Acquire row lock on Result
      const lockedResults = await tx.$queryRaw<
        Array<{
          id: string;
          grade: Prisma.Decimal;
          publishedAt: Date | null;
          updatedAt: Date;
        }>
      >`
        SELECT id, grade, "publishedAt", "updatedAt" FROM "Result" WHERE id = ${submission.result.id} FOR UPDATE
      `;

      if (lockedResults.length === 0) {
        return { status: 404 as const, error: "Result not found." };
      }

      const lockedRes = lockedResults[0];

      // Stale publication check: if grade changed or result updated since staff viewed it
      if (
        lockedRes.updatedAt.toISOString() !== parsed.data.expectedResultUpdatedAt
      ) {
        return {
          status: 409 as const,
          error:
            "The grade has been modified by another action. Please reopen the record before publishing.",
        };
      }

      if (
        !new Prisma.Decimal(lockedRes.grade).equals(
          new Prisma.Decimal(parsed.data.expectedGrade),
        )
      ) {
        return {
          status: 409 as const,
          error:
            "The grade has changed since it was loaded. Please reopen the record before publishing.",
        };
      }

      const updatedResult = await tx.result.update({
        where: { id: lockedRes.id },
        data: {
          publishedAt: new Date(),
        },
      });

      return { status: 200 as const, result: updatedResult };
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
            : "An unexpected error occurred while publishing the grade.",
      },
      { status: 500 },
    );
  }
}
