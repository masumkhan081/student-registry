import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoIdentity } from "@/lib/demo-session";
import { recordPaymentSchema } from "@/features/fees/schema";
import { parseDateOnly } from "@/features/students/schema";
import { calculateFeeSummary, parseCents } from "@/features/fees/calculations";
import { Prisma } from "@/generated/prisma/client";

class StudentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentNotFoundError";
  }
}

class FeeAssignmentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeeAssignmentNotFoundError";
  }
}

class DuplicateReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateReferenceError";
  }
}

class OverpaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverpaymentError";
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Server guard: check authentication and staff identity
  const identity = await getDemoIdentity();

  if (!identity) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (identity.role !== "STAFF") {
    return NextResponse.json(
      { error: "Access denied. Staff role required." },
      { status: 403 },
    );
  }

  // 2. Cross-origin request verification
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  }

  // 3. Resolve student id parameter
  const { id: studentId } = await params;

  // 4. Parse request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // 5. Validate input with Zod schema
  const parsed = recordPaymentSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue.message,
        field: issue.path[0] as string | undefined,
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const paymentAmount = new Prisma.Decimal(data.amount);
  const paymentDate = parseDateOnly(data.paymentDate);
  const trimmedReference = data.reference.trim();

  try {
    // Transaction Strategy:
    // We execute an interactive transaction that acquires a PostgreSQL exclusive row lock
    // (`SELECT ... FOR UPDATE`) on the student's `FeeAssignment` record.
    // This serializes all payment processing and programme-change edits for this fee assignment.
    // If two concurrent payment requests arrive, the second transaction is held at the lock until the
    // first commits, ensuring the second transaction reads the fresh payment total and cannot cause
    // an overpayment. Similarly, any concurrent programme edit will wait and observe the new payment.
    const result = await db.$transaction(async (tx) => {
      // Find the student and their fee assignment
      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          feeAssignment: {
            select: { id: true },
          },
        },
      });

      if (!student) {
        throw new StudentNotFoundError("Student record not found.");
      }

      if (!student.feeAssignment) {
        throw new FeeAssignmentNotFoundError(
          "Student has no assigned fee obligation.",
        );
      }

      const feeAssignmentId = student.feeAssignment.id;

      // Acquire exclusive row lock on FeeAssignment
      await tx.$queryRaw`SELECT id FROM "FeeAssignment" WHERE id = ${feeAssignmentId} FOR UPDATE`;

      // Read fee assignment amount and all existing payments under lock
      const feeAssignment = await tx.feeAssignment.findUniqueOrThrow({
        where: { id: feeAssignmentId },
        select: {
          id: true,
          amount: true,
          dueDate: true,
          payments: {
            select: {
              id: true,
              amount: true,
              reference: true,
            },
          },
        },
      });

      // Reject duplicate reference within the same fee assignment (case-insensitive check)
      const duplicateRef = feeAssignment.payments.find(
        (p) => p.reference.toLowerCase() === trimmedReference.toLowerCase(),
      );
      if (duplicateRef) {
        throw new DuplicateReferenceError(
          `Payment reference "${trimmedReference}" is already used for this student's fee.`,
        );
      }

      // Calculate current summary under lock
      const currentSummary = calculateFeeSummary(
        feeAssignment.amount,
        feeAssignment.payments,
        feeAssignment.dueDate,
      );

      // Reject overpayments
      const paymentCents = parseCents(data.amount);
      if (paymentCents > currentSummary.balanceCents) {
        throw new OverpaymentError(
          `Payment amount (£${paymentAmount.toFixed(2)}) exceeds the outstanding balance (£${currentSummary.outstandingBalance}).`,
        );
      }

      // Record the payment
      const newPayment = await tx.payment.create({
        data: {
          feeAssignmentId,
          amount: paymentAmount,
          paymentDate,
          reference: trimmedReference,
        },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          reference: true,
          createdAt: true,
        },
      });

      // Calculate new summary after payment
      const updatedPayments = [
        ...feeAssignment.payments,
        { amount: newPayment.amount },
      ];
      const newSummary = calculateFeeSummary(
        feeAssignment.amount,
        updatedPayments,
        feeAssignment.dueDate,
      );

      return {
        payment: {
          id: newPayment.id,
          amount: newPayment.amount.toFixed(2),
          paymentDate: newPayment.paymentDate.toISOString().slice(0, 10),
          reference: newPayment.reference,
          createdAt: newPayment.createdAt.toISOString(),
        },
        summary: {
          assignedFee: newSummary.assignedFee,
          totalPaid: newSummary.totalPaid,
          outstandingBalance: newSummary.outstandingBalance,
          isPaidInFull: newSummary.isPaidInFull,
          isOverdue: newSummary.isOverdue,
        },
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof StudentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof FeeAssignmentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DuplicateReferenceError) {
      return NextResponse.json(
        { error: error.message, field: "reference" },
        { status: 409 },
      );
    }

    if (error instanceof OverpaymentError) {
      return NextResponse.json(
        { error: error.message, field: "amount" },
        { status: 400 },
      );
    }

    // Handle database unique constraint conflict (e.g. concurrent identical reference)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: `Payment reference "${trimmedReference}" is already used for this student's fee.`,
          field: "reference",
        },
        { status: 409 },
      );
    }

    console.error("Failed to record payment:", error);
    return NextResponse.json(
      { error: "Failed to record payment. Please try again." },
      { status: 500 },
    );
  }
}
