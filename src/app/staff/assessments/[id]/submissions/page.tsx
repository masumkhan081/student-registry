import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import { formatUtcDateTimeDisplay } from "@/features/assessments/format";
import { formatStudentId } from "@/features/students/format";
import { getGradeClassification } from "@/features/assessments/format";
import {
  StaffSubmissionRow,
  type StaffSubmissionItem,
} from "@/features/assessments/staff-submission-row";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const assessment = await db.assessment.findUnique({
    where: { id },
    select: { title: true, module: true },
  });

  return {
    title: assessment
      ? `Submissions: ${assessment.title} · Student Registry`
      : "Assessment submissions · Student Registry",
    description: "Review and grade student assessment submissions.",
  };
}

async function SubmissionsContent({ params }: PageProps) {
  // 1. Guard page on the server
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STAFF") {
    redirect("/dashboard");
  }

  const { id: assessmentId } = await params;

  // 2. Query assessment and its submissions
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      programme: true,
      submissions: {
        include: {
          student: true,
          result: true,
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!assessment) {
    notFound();
  }

  const formattedSubmissions: StaffSubmissionItem[] = assessment.submissions.map(
    (sub) => {
      const isLate = sub.submittedAt.getTime() > assessment.deadline.getTime();
      return {
        id: sub.id,
        studentId: sub.student.id,
        studentName: sub.student.fullName,
        formattedStudentId: formatStudentId(
          sub.student.studentNumber,
          sub.student.enrolmentYear,
        ),
        originalFilename: sub.originalFilename,
        size: sub.size,
        submittedAt: sub.submittedAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
        isLate,
        result: sub.result
          ? {
              id: sub.result.id,
              grade: sub.result.grade.toFixed(2),
              classification: getGradeClassification(sub.result.grade.toNumber()),
              publishedAt: sub.result.publishedAt
                ? sub.result.publishedAt.toISOString()
                : null,
              updatedAt: sub.result.updatedAt.toISOString(),
            }
          : null,
      };
    },
  );

  return (
    <div className="space-y-6">
      {/* Header and Back Link */}
      <div>
        <Link
          href="/staff/assessments"
          className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
        >
          ← Back to assessments
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Submissions: {assessment.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">
                {assessment.module}
              </span>{" "}
              · {assessment.programme.name} ({assessment.academicYear})
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-slate-500 block">
              Deadline: {formatUtcDateTimeDisplay(assessment.deadline)}
            </span>
            <span className="text-xs font-semibold text-slate-700 mt-0.5 inline-block">
              {assessment.submissions.length}{" "}
              {assessment.submissions.length === 1
                ? "submission"
                : "submissions"}
            </span>
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      {formattedSubmissions.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"
        >
          <h2 className="text-base font-semibold text-slate-900">
            No submissions recorded
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Students in {assessment.programme.name} ({assessment.academicYear})
            have not submitted any work for this assessment yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <caption className="sr-only">
              Student submissions and grading for {assessment.title}
            </caption>
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th scope="col" className="px-6 py-3.5">
                  Student
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Submitted document
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Submission time (UTC)
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Grading state
                </th>
                <th scope="col" className="px-6 py-3.5 text-right">
                  Grade & publication
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {formattedSubmissions.map((sub) => (
                <StaffSubmissionRow
                  key={sub.id}
                  submission={sub}
                  assessmentTitle={assessment.title}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StaffAssessmentSubmissionsPage(props: PageProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading submissions...
              </p>
            </div>
          }
        >
          <SubmissionsContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}
