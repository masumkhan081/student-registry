import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  formatStudentId,
  formatEnrolmentStatus,
  formatDateDisplay,
} from "@/features/students/format";
import { StudentFeeSection } from "@/features/fees/student-fee-section";
import type { EnrolmentStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Student details · Student Registry",
  description: "View student record and fee assignment details.",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getStatusBadgeClass(status: EnrolmentStatus): string {
  switch (status) {
    case "ENROLLED":
      return "inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
    case "DEFERRED":
      return "inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20";
    case "WITHDRAWN":
      return "inline-flex items-center rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20";
    case "COMPLETED":
      return "inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20";
    default:
      return "inline-flex items-center rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-600/20";
  }
}

async function StudentDetailContent({
  params,
  searchParams,
}: PageProps) {
  // 1. Guard page on the server before querying database
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STAFF") {
    redirect("/dashboard");
  }

  const { id } = await params;
  const rawParams = await searchParams;
  const isUpdated = rawParams.updated === "true";

  // 2. Load student record with fee assignment and activity
  const student = await db.student.findUnique({
    where: { id },
    select: {
      id: true,
      studentNumber: true,
      enrolmentYear: true,
      fullName: true,
      email: true,
      dateOfBirth: true,
      academicYear: true,
      status: true,
      programme: {
        select: {
          id: true,
          name: true,
        },
      },
      feeAssignment: {
        select: {
          id: true,
          amount: true,
          dueDate: true,
          payments: {
            select: {
              id: true,
              amount: true,
              paymentDate: true,
              reference: true,
              createdAt: true,
            },
            orderBy: [
              { paymentDate: "desc" },
              { createdAt: "desc" },
            ],
          },
        },
      },
      _count: {
        select: { submissions: true },
      },
    },
  });

  if (!student) {
    notFound();
  }

  const formattedId = formatStudentId(
    student.enrolmentYear,
    student.studentNumber,
  );

  const paymentCount = student.feeAssignment?.payments.length ?? 0;
  const submissionCount = student._count.submissions;
  const hasHistory = paymentCount > 0 || submissionCount > 0;

  const serializedFeeAssignment = student.feeAssignment
    ? {
        id: student.feeAssignment.id,
        amount: student.feeAssignment.amount.toFixed(2),
        dueDate: student.feeAssignment.dueDate.toISOString().slice(0, 10),
      }
    : null;

  const serializedPayments =
    student.feeAssignment?.payments.map((p) => ({
      id: p.id,
      amount: p.amount.toFixed(2),
      paymentDate: p.paymentDate.toISOString().slice(0, 10),
      reference: p.reference,
      createdAt: p.createdAt.toISOString(),
    })) ?? [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div>
        <Link
          href="/staff/students"
          className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
        >
          ← Back to student directory
        </Link>
      </div>

      {/* Success Notification after update */}
      {isUpdated && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <p className="font-semibold text-emerald-800">
            Student record updated successfully
          </p>
          <p className="mt-1 text-emerald-700">
            Changes to <span className="font-semibold">{student.fullName}</span> have been saved to the registry.
          </p>
        </div>
      )}

      {/* Header and Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-medium text-slate-500">
              {formattedId}
            </span>
            <span className={getStatusBadgeClass(student.status)}>
              {formatEnrolmentStatus(student.status)}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {student.fullName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Enrolled in {student.programme.name} · Academic year {student.academicYear}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/staff/students/${student.id}/edit`}
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Edit student
          </Link>
        </div>
      </div>

      {/* Detail Panels */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Personal & Enrolment Information */}
        <section
          aria-labelledby="personal-info-heading"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2
            id="personal-info-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Personal & Enrolment Information
          </h2>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-slate-500">Student ID</dt>
              <dd className="font-mono font-medium text-slate-900 sm:col-span-2">
                {formattedId}
              </dd>
            </div>
            <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-slate-500">Full name</dt>
              <dd className="font-medium text-slate-900 sm:col-span-2">
                {student.fullName}
              </dd>
            </div>
            <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-slate-500">Email address</dt>
              <dd className="text-slate-900 sm:col-span-2">{student.email}</dd>
            </div>
            <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-slate-500">Date of birth</dt>
              <dd className="text-slate-900 sm:col-span-2">
                {formatDateDisplay(student.dateOfBirth)}
              </dd>
            </div>
            <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-slate-500">Enrolment year</dt>
              <dd className="text-slate-900 sm:col-span-2">
                {student.enrolmentYear}
              </dd>
            </div>
            <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-slate-500">Enrolment status</dt>
              <dd className="text-slate-900 sm:col-span-2">
                <span className={getStatusBadgeClass(student.status)}>
                  {formatEnrolmentStatus(student.status)}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Academic Programme & Fees */}
        <section
          aria-labelledby="fee-info-heading"
          className="space-y-6"
        >
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2
              id="fee-info-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Programme & Fees
            </h2>
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="font-medium text-slate-500">Programme</dt>
                <dd className="font-medium text-slate-900 sm:col-span-2">
                  {student.programme.name}
                </dd>
              </div>
              <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="font-medium text-slate-500">Academic year</dt>
                <dd className="text-slate-900 sm:col-span-2">
                  {student.academicYear}
                </dd>
              </div>
              <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="font-medium text-slate-500">Assigned fee</dt>
                <dd className="font-medium text-slate-900 sm:col-span-2">
                  {student.feeAssignment
                    ? `£${Number(student.feeAssignment.amount).toFixed(2)}`
                    : "None assigned"}
                </dd>
              </div>
              <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="font-medium text-slate-500">Fee due date</dt>
                <dd className="text-slate-900 sm:col-span-2">
                  {student.feeAssignment?.dueDate
                    ? formatDateDisplay(student.feeAssignment.dueDate)
                    : "Not set"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Activity / Immutability Status Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-sm">
            <h3 className="font-semibold text-slate-900">
              Record Immutability Rules
            </h3>
            <ul className="mt-2 space-y-1.5 text-slate-600">
              <li>
                • Student number and enrolment year (<span className="font-mono">{formattedId}</span>) remain permanently fixed.
              </li>
              <li>
                • {hasHistory ? (
                  <span className="text-amber-800 font-medium">
                    Programme and academic year are locked because {paymentCount > 0 ? `${paymentCount} payment(s)` : ""}{paymentCount > 0 && submissionCount > 0 ? " and " : ""}{submissionCount > 0 ? `${submissionCount} submission(s)` : ""} exist.
                  </span>
                ) : (
                  <span className="text-emerald-800">
                    Programme and academic year can still be corrected (no payments or submissions recorded).
                  </span>
                )}
              </li>
            </ul>
          </div>
        </section>
      </div>

      {/* Fees, Live Balance, Payment History & Payment Recording */}
      {serializedFeeAssignment && (
        <StudentFeeSection
          studentId={student.id}
          feeAssignment={serializedFeeAssignment}
          initialPayments={serializedPayments}
        />
      )}
    </div>
  );
}

export default function StudentDetailPage(props: PageProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading student record...
              </p>
            </div>
          }
        >
          <StudentDetailContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}
