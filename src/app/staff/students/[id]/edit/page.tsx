import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  EditStudentForm,
  type EditableStudent,
  type ProgrammeOption,
} from "@/features/students/edit-student-form";
import { formatDateInputValue } from "@/features/students/format";

export const metadata: Metadata = {
  title: "Edit student · Student Registry",
  description: "Edit student personal details and enrolment information.",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

async function EditStudentContent({ params }: PageProps) {
  // 1. Guard page on the server before querying database
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STAFF") {
    redirect("/dashboard");
  }

  const { id } = await params;

  // 2. Fetch student with fee assignment and activity counts, and programmes
  const [student, rawProgrammes] = await Promise.all([
    db.student.findUnique({
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
    }),
    db.programme.findMany({
      select: {
        id: true,
        name: true,
        defaultFee: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  if (!student) {
    notFound();
  }

  const paymentCount = student.feeAssignment?._count.payments ?? 0;
  const submissionCount = student._count.submissions;
  const hasHistory = paymentCount > 0 || submissionCount > 0;

  const lockReason = hasHistory
    ? `Programme and academic year are locked because this student has ${paymentCount > 0 ? `${paymentCount} payment(s)` : ""}${paymentCount > 0 && submissionCount > 0 ? " and " : ""}${submissionCount > 0 ? `${submissionCount} submission(s)` : ""} on record.`
    : undefined;

  const editableStudent: EditableStudent = {
    id: student.id,
    studentNumber: student.studentNumber,
    enrolmentYear: student.enrolmentYear,
    fullName: student.fullName,
    email: student.email,
    dateOfBirth: formatDateInputValue(student.dateOfBirth),
    programmeId: student.programmeId,
    academicYear: student.academicYear,
    status: student.status,
    feeAssignment: student.feeAssignment
      ? {
          amount: student.feeAssignment.amount.toFixed(2),
          dueDate: formatDateInputValue(student.feeAssignment.dueDate),
        }
      : null,
    hasHistory,
    lockReason,
  };

  const programmes: ProgrammeOption[] = rawProgrammes.map((p) => ({
    id: p.id,
    name: p.name,
    defaultFee: p.defaultFee.toFixed(2),
  }));

  return (
    <EditStudentForm student={editableStudent} programmes={programmes} />
  );
}

export default function EditStudentPage(props: PageProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading student edit form...
              </p>
            </div>
          }
        >
          <EditStudentContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}
