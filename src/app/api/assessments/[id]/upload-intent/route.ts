import { NextResponse } from "next/server";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import { createSignedUploadUrl } from "@/lib/storage";

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

  // 2. Resolve student and verify record
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

  // 5. Check existing submission & deadline rules
  const now = new Date();
  const existingSubmission = await db.submission.findUnique({
    where: {
      studentId_assessmentId: {
        studentId: student.id,
        assessmentId: assessment.id,
      },
    },
    select: { id: true },
  });

  // Replacements are allowed strictly before the deadline
  if (existingSubmission && now.getTime() >= assessment.deadline.getTime()) {
    return NextResponse.json(
      {
        error:
          "Submissions are closed. Replacements are not permitted after the deadline.",
      },
      { status: 400 },
    );
  }

  // 6. Validate input filename for extension
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const filename =
    typeof body === "object" && body !== null && "filename" in body
      ? String((body as { filename: unknown }).filename).trim()
      : "";

  const lowerName = filename.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isDocx = lowerName.endsWith(".docx");

  if (!isPdf && !isDocx) {
    return NextResponse.json(
      {
        error:
          "Invalid file extension. Only .pdf and .docx files are accepted.",
      },
      { status: 400 },
    );
  }

  const extension = isDocx ? "docx" : "pdf";

  // 7. Generate a unique, non-overwriting object path scoped to student and assessment
  const uniqueId = `${Date.now()}-${crypto.randomUUID()}`;
  const storagePath = `submissions/${student.id}/${assessment.id}/${uniqueId}.${extension}`;

  try {
    const uploadResult = await createSignedUploadUrl(storagePath);

    return NextResponse.json({
      uploadUrl: uploadResult.signedUrl,
      storagePath,
      token: uploadResult.token,
      isReplacement: Boolean(existingSubmission),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Storage error";
    return NextResponse.json(
      { error: `Unable to initiate upload: ${message}` },
      { status: 500 },
    );
  }
}
