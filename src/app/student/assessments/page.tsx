import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  formatUtcDateTimeDisplay,
  isPastDeadline,
} from "@/features/assessments/format";

export const metadata: Metadata = {
  title: "My assessments · Student Registry",
  description: "View coursework and assessment deadlines for your programme cohort.",
};

async function StudentAssessmentsContent() {
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STUDENT") {
    redirect("/staff/assessments");
  }

  // Resolve student from server-side demo identity.
  // Never accept a student ID from the browser to decide whose assessments to show.
  const student = await db.student.findUnique({
    where: { id: identity.studentId },
    select: {
      id: true,
      fullName: true,
      programmeId: true,
      academicYear: true,
      programme: {
        select: { name: true },
      },
    },
  });

  if (!student) {
    redirect("/");
  }

  // Cohort check: Query assessments matching BOTH their programme and academic year
  const assessments = await db.assessment.findMany({
    where: {
      programmeId: student.programmeId,
      academicYear: student.academicYear,
    },
    select: {
      id: true,
      title: true,
      module: true,
      deadline: true,
    },
    orderBy: { deadline: "asc" },
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      {/* Header and Back Link */}
      <div>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
        >
          ← Back to dashboard
        </Link>
        <div className="mt-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            My assessments
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cohort: <span className="font-semibold text-slate-800">{student.programme.name}</span> · Academic year <span className="font-semibold text-slate-800">{student.academicYear}</span>
          </p>
        </div>
      </div>

      {/* Assessment List */}
      {assessments.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"
        >
          <h2 className="text-base font-semibold text-slate-900">
            No assessments scheduled
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            There are currently no assessments assigned for your programme and academic year cohort.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <caption className="sr-only">Coursework and assessment deadlines</caption>
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th scope="col" className="px-6 py-3.5">
                  Title & Module
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Submission deadline (UTC)
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {assessments.map((assessment) => {
                const past = isPastDeadline(assessment.deadline, now);

                return (
                  <tr key={assessment.id} className="hover:bg-slate-50/75">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">
                        {assessment.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {assessment.module}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-900">
                      {formatUtcDateTimeDisplay(assessment.deadline)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {past ? (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                          Past deadline
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Upcoming
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StudentAssessmentsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading your assessments...
              </p>
            </div>
          }
        >
          <StudentAssessmentsContent />
        </Suspense>
      </div>
    </main>
  );
}
