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
  title: "Assessments · Student Registry",
  description: "View and manage assessments across programme cohorts.",
};

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function StaffAssessmentsContent({ searchParams }: PageProps) {
  // 1. Guard page on the server before querying database
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STAFF") {
    redirect("/dashboard");
  }

  const rawParams = await searchParams;
  const isCreated = rawParams.created === "true";

  // 2. Fetch all assessments ordered by deadline
  const assessments = await db.assessment.findMany({
    select: {
      id: true,
      title: true,
      module: true,
      academicYear: true,
      deadline: true,
      programme: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: { submissions: true },
      },
    },
    orderBy: [{ deadline: "asc" }, { title: "asc" }],
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
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Assessments
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage coursework and examination deadlines across programmes.
            </p>
          </div>

          <div>
            <Link
              href="/staff/assessments/new"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Create assessment
            </Link>
          </div>
        </div>
      </div>

      {/* Creation Success Banner */}
      {isCreated && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <p className="font-semibold text-emerald-800">
            Assessment created successfully
          </p>
          <p className="mt-1 text-emerald-700">
            The new assessment is now visible to students in the matching programme and academic year cohort.
          </p>
        </div>
      )}

      {/* Assessment Table or Empty State */}
      {assessments.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"
        >
          <h2 className="text-base font-semibold text-slate-900">
            No assessments found
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            No assessments have been created yet. Get started by defining the first assessment deadline.
          </p>
          <div className="mt-6">
            <Link
              href="/staff/assessments/new"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Create assessment
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <caption className="sr-only">Directory of registry assessments</caption>
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th scope="col" className="px-6 py-3.5">
                  Title & Module
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Programme
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Academic year
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Deadline (UTC)
                </th>
                <th scope="col" className="px-6 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-6 py-3.5 text-right">
                  Actions
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
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-700">
                      {assessment.programme.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                      {assessment.academicYear}
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
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <Link
                        href={`/staff/assessments/${assessment.id}/submissions`}
                        className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        View submissions ({assessment._count.submissions})
                      </Link>
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

export default function StaffAssessmentsPage(props: PageProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading assessments...
              </p>
            </div>
          }
        >
          <StaffAssessmentsContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}
