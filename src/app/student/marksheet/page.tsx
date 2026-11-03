import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  formatUtcDateTimeDisplay,
  getGradeClassification,
} from "@/features/assessments/format";

export const metadata: Metadata = {
  title: "My marksheet · Student Registry",
  description: "View published assessment grades and classifications.",
};

async function MarksheetContent() {
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STUDENT") {
    redirect("/staff/assessments");
  }

  // Resolve student from server session
  const student = await db.student.findUnique({
    where: { id: identity.studentId },
    select: {
      id: true,
      fullName: true,
      programme: { select: { name: true } },
      academicYear: true,
    },
  });

  if (!student) {
    redirect("/");
  }

  // Query ONLY published results for this student. Withheld grades are absent from the query.
  const publishedResults = await db.result.findMany({
    where: {
      submission: {
        studentId: student.id,
      },
      publishedAt: {
        not: null,
      },
    },
    include: {
      submission: {
        include: {
          assessment: true,
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

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
            My marksheet
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Official published results for <span className="font-semibold text-slate-800">{student.fullName}</span> · {student.programme.name} ({student.academicYear})
          </p>
        </div>
      </div>

      {/* Marksheet Table or Empty State */}
      {publishedResults.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"
        >
          <h2 className="text-base font-semibold text-slate-900">
            No results published yet.
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            When grades are officially published by the registry, your results and classifications will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <caption className="sr-only">
              Official published marksheet and classifications
            </caption>
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th scope="col" className="px-6 py-3.5">
                  Assessment & Module
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Grade
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Classification
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Publication date (UTC)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {publishedResults.map((res) => {
                const gradeNum = res.grade.toNumber();
                const classification = getGradeClassification(gradeNum);

                const badgeColor =
                  classification === "Distinction"
                    ? "bg-purple-50 text-purple-700 ring-purple-600/20"
                    : classification === "Merit"
                      ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                      : classification === "Pass"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                        : "bg-rose-50 text-rose-700 ring-rose-600/20";

                return (
                  <tr key={res.id} className="hover:bg-slate-50/75">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">
                        {res.submission.assessment.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {res.submission.assessment.module}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono font-semibold text-slate-900">
                      {res.grade.toFixed(2)}%
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${badgeColor}`}
                      >
                        {classification}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-600">
                      {res.publishedAt ? formatUtcDateTimeDisplay(res.publishedAt) : "—"}
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

export default function StudentMarksheetPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading your marksheet...
              </p>
            </div>
          }
        >
          <MarksheetContent />
        </Suspense>
      </div>
    </main>
  );
}
