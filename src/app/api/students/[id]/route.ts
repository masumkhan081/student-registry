import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoIdentity } from "@/lib/demo-session";
import { formatStudentId } from "@/features/students/format";
import {
  updateStudentSchema,
  parseDateOnly,
} from "@/features/students/schema";
import { Prisma } from "@/generated/prisma/client";

class StudentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentNotFoundError";
  }
}

class DuplicateEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateEmailError";
  }
}

class LockedCorrectionError extends Error {
  field: "programmeId" | "academicYear";
  constructor(message: string, field: "programmeId" | "academicYear") {
    super(message);
    this.name = "LockedCorrectionError";
    this.field = field;
  }
}

class UnknownProgrammeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownProgrammeError";
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Guard API on the server: check identity & role before database work
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

  // 3. Resolve params and parse JSON body
  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // 4. Validate input with shared schema
  const parsed = updateStudentSchema.safeParse(rawBody);
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
  const dob = parseDateOnly(data.dateOfBirth);
  const feeDueDate = parseDateOnly(data.dueDate);

  try {
    const updated = await db.$transaction(async (tx) => {
      // Find current student with fee assignment and activity counts
      const student = await tx.student.findUnique({
        where: { id },
        include: {
          feeAssignment: {
            include: {
              _count: {
                select: { payments: true },
              },
            },
          },
          _count: {
            select: { submissions: true },
          },
        },
      });

      if (!student) {
        throw new StudentNotFoundError("Student record not found.");
      }

      // Check email uniqueness excluding current student
      if (data.email !== student.email) {
        const emailConflict = await tx.student.findFirst({
          where: {
            email: data.email,
            NOT: { id: student.id },
          },
          select: { id: true },
        });

        if (emailConflict) {
          throw new DuplicateEmailError(
            "A student with this email address already exists.",
          );
        }
      }

      // Check whether student has payments or submissions
      const paymentCount = student.feeAssignment?._count.payments ?? 0;
      const submissionCount = student._count.submissions;
      const hasHistory = paymentCount > 0 || submissionCount > 0;

      const isProgrammeChanging = data.programmeId !== student.programmeId;
      const isAcademicYearChanging = data.academicYear !== student.academicYear;

      if (hasHistory) {
        if (isProgrammeChanging) {
          throw new LockedCorrectionError(
            "Programme cannot be changed once payments or submissions exist.",
            "programmeId",
          );
        }
        if (isAcademicYearChanging) {
          throw new LockedCorrectionError(
            "Academic year cannot be changed once payments or submissions exist.",
            "academicYear",
          );
        }
      }

      // If programme is changing, look up the new programme's default fee
      let newProgrammeFee: Prisma.Decimal | null = null;
      if (isProgrammeChanging) {
        const newProgramme = await tx.programme.findUnique({
          where: { id: data.programmeId },
          select: { id: true, defaultFee: true },
        });

        if (!newProgramme) {
          throw new UnknownProgrammeError("Selected programme does not exist.");
        }

        newProgrammeFee = newProgramme.defaultFee;
      }

      // Update student: personal details, status, programme/academicYear if permitted.
      // studentNumber and enrolmentYear are kept strictly immutable.
      return tx.student.update({
        where: { id: student.id },
        data: {
          fullName: data.fullName,
          email: data.email,
          dateOfBirth: dob,
          programmeId: data.programmeId,
          academicYear: data.academicYear,
          status: data.status,
          ...(student.feeAssignment
            ? {
                feeAssignment: {
                  update: {
                    dueDate: feeDueDate,
                    // If changing programme, update fee assignment to new programme's default fee.
                    // Editing only name, status or academic year preserves existing snapshot.
                    ...(newProgrammeFee !== null
                      ? { amount: newProgrammeFee }
                      : {}),
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          studentNumber: true,
          enrolmentYear: true,
          fullName: true,
        },
      });
    });

    const formattedId = formatStudentId(
      updated.enrolmentYear,
      updated.studentNumber,
    );

    return NextResponse.json(
      {
        student: {
          id: updated.id,
          studentId: formattedId,
          fullName: updated.fullName,
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (error instanceof StudentNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 },
      );
    }

    if (error instanceof DuplicateEmailError) {
      return NextResponse.json(
        { error: error.message, field: "email" },
        { status: 409 },
      );
    }

    if (error instanceof LockedCorrectionError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }

    if (error instanceof UnknownProgrammeError) {
      return NextResponse.json(
        { error: error.message, field: "programmeId" },
        { status: 400 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : String(error.meta?.target ?? "");

      if (
        target.includes("email") ||
        target === "" ||
        error.message.toLowerCase().includes("email")
      ) {
        return NextResponse.json(
          {
            error: "A student with this email address already exists.",
            field: "email",
          },
          { status: 409 },
        );
      }
    }

    console.error("Failed to update student:", error);
    return NextResponse.json(
      { error: "Failed to update student record. Please try again." },
      { status: 500 },
    );
  }
}
