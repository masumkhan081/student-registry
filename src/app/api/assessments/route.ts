import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoIdentity } from "@/lib/demo-session";
import { createAssessmentSchema } from "@/features/assessments/schema";
import { parseUtcDateTime } from "@/features/assessments/format";

export async function POST(request: Request) {
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

  // 4. Validate input with shared schema
  const parsed = createAssessmentSchema.safeParse(rawBody);
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

  // 5. Convert deadline to exact UTC Date without timezone shifts
  const deadlineUtc = parseUtcDateTime(data.deadline);
  if (!deadlineUtc) {
    return NextResponse.json(
      {
        error: "Enter a valid calendar date and time in UTC (YYYY-MM-DD HH:mm).",
        field: "deadline",
      },
      { status: 400 },
    );
  }

  try {
    // 6. Verify the programme exists in the database
    const programme = await db.programme.findUnique({
      where: { id: data.programmeId },
      select: { id: true, name: true },
    });

    if (!programme) {
      return NextResponse.json(
        {
          error: "Selected programme does not exist.",
          field: "programmeId",
        },
        { status: 400 },
      );
    }

    // 7. Create the assessment record
    const assessment = await db.assessment.create({
      data: {
        title: data.title,
        module: data.module,
        programmeId: data.programmeId,
        academicYear: data.academicYear,
        deadline: deadlineUtc,
      },
      select: {
        id: true,
        title: true,
        module: true,
        programmeId: true,
        academicYear: true,
        deadline: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        assessment: {
          id: assessment.id,
          title: assessment.title,
          module: assessment.module,
          programmeId: assessment.programmeId,
          programmeName: programme.name,
          academicYear: assessment.academicYear,
          deadline: assessment.deadline.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Failed to create assessment:", error);
    return NextResponse.json(
      { error: "Failed to create assessment. Please try again." },
      { status: 500 },
    );
  }
}
