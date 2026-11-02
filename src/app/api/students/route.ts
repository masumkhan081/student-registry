import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoIdentity } from "@/lib/demo-session";
import { formatStudentId } from "@/features/students/format";
import {
  enrolStudentSchema,
  parseDateOnly,
} from "@/features/students/schema";
import { Prisma } from "@/generated/prisma/client";

class UnknownProgrammeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownProgrammeError";
  }
}

export async function POST(request: Request) {
  // 1. Check identity and role before doing database work
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

  // 3. Parse JSON body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // 4. Validate input with shared Zod schema
  const parsed = enrolStudentSchema.safeParse(rawBody);
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

  // 5. Server-derived enrolment attributes: calendar year of enrolment
  const enrolmentYear = new Date().getUTCFullYear();
  const dob = parseDateOnly(data.dateOfBirth);
  const feeDueDate = parseDateOnly(data.dueDate);

  try {
    const student = await db.$transaction(async (tx) => {
      // Look up programme to read current default fee (never trust browser values)
      const programme = await tx.programme.findUnique({
        where: { id: data.programmeId },
        select: { id: true, defaultFee: true },
      });

      if (!programme) {
        throw new UnknownProgrammeError("Selected programme does not exist.");
      }

      // Atomically create student and fee assignment
      return tx.student.create({
        data: {
          fullName: data.fullName,
          email: data.email,
          dateOfBirth: dob,
          programmeId: programme.id,
          academicYear: data.academicYear,
          enrolmentYear,
          status: data.status,
          feeAssignment: {
            create: {
              amount: programme.defaultFee,
              dueDate: feeDueDate,
            },
          },
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
      student.enrolmentYear,
      student.studentNumber,
    );

    return NextResponse.json(
      {
        student: {
          id: student.id,
          studentId: formattedId,
          fullName: student.fullName,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof UnknownProgrammeError) {
      return NextResponse.json(
        { error: error.message, field: "programmeId" },
        { status: 400 },
      );
    }

    // Handle duplicate email uniqueness conflict (including concurrent submissions)
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

    console.error("Failed to enrol student:", error);
    return NextResponse.json(
      { error: "Failed to enrol student. Please try again." },
      { status: 500 },
    );
  }
}
