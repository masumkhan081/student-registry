import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import {
  formatStudentId,
  formatEnrolmentStatus,
} from "@/features/students/format";
import { parseStudentFilters } from "@/features/students/schema";
import {
  getProgrammeFilterOptions,
  getStudentsDirectory,
  type DirectoryStudent,
} from "@/features/students/queries";
import { StudentDirectoryFilters } from "@/features/students/student-directory-filters";
import { StudentRowActions } from "@/features/students/student-row-actions";
import { calculateFeeSummary } from "@/features/fees/calculations";
import type { EnrolmentStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Student directory · Student Registry",
  description: "View and filter student records in the registry.",
};

type PageProps = {
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

async function StaffStudentsContent({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // 1. Enforce demo identity check BEFORE any database queries.
  // Unauthenticated visitors redirect to /. Students redirect to /dashboard.
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STAFF") {
    redirect("/dashboard");
  }

  // 2. Validate request parameters on the server
  const rawParams = await searchParams;
  const filters = parseStudentFilters(rawParams);

  // 3. Query filter options and students from PostgreSQL in a single round-trip
  const [programmes, students] = await Promise.all([
    getProgrammeFilterOptions(),
    getStudentsDirectory(filters),
  ]);

  const hasActiveFilters = Boolean(
    filters.search || filters.programme || filters.status,
  );

  const enrolledId =
    typeof rawParams.enrolled === "string"
      ? rawParams.enrolled
      : Array.isArray(rawParams.enrolled)
        ? rawParams.enrolled[0]
        : undefined;

  return (
    <div className="space-y-6">
      {/* Navigation and Heading */}
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
              Student directory
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Search and filter student records across all programmes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm font-medium text-slate-500" aria-live="polite">
              Showing {students.length}{" "}
              {students.length === 1 ? "student" : "students"}
            </p>
            <Link
              href="/staff/students/new"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Enrol student
            </Link>
          </div>
        </div>
      </div>

      {/* Success banner for newly enrolled student */}
      {enrolledId && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <p className="font-semibold text-emerald-800">
            Student enrolled successfully
          </p>
          <p className="mt-1 text-emerald-700">
            Student ID{" "}
            <span className="font-mono font-medium">{enrolledId}</span> has
            been enrolled with their assigned programme fee obligation.
          </p>
        </div>
      )}

      {/* Live search and filters (300ms debounce, immediate selects, keyboard focus preserved) */}
      <StudentDirectoryFilters
        initialSearch={filters.search ?? ""}
        initialProgramme={filters.programme ?? ""}
        initialStatus={filters.status ?? ""}
        programmes={programmes}
      />

      {/* Results Table or Empty State */}
      {students.length === 0 ? (
        <section
          role="status"
          aria-label="No results found"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"
        >
          <h2 className="text-base font-semibold text-slate-900">
            No students found
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {hasActiveFilters
              ? "No students match your search and filter criteria. Try adjusting your query or clearing filters to view all records."
              : "No student records are currently available."}
          </p>
          {hasActiveFilters && (
            <div className="mt-6">
              <Link
                href="/staff/students"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Clear filters
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Student records">
          <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto rounded-xl">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
                <caption className="sr-only">
                  Directory of enrolled students
                </caption>
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">
                      Student ID
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Full name
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Programme
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Academic year
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Enrolment status
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {students.map((student: DirectoryStudent) => {
                    const formattedId = formatStudentId(
                      student.enrolmentYear,
                      student.studentNumber,
                    );
                    const isHighlighted =
                      enrolledId &&
                      (formattedId === enrolledId || student.id === enrolledId);

                    // Reuses existing balance calculation without extra DB queries per row
                    const hasOutstandingBalance = Boolean(
                      student.feeAssignment &&
                        calculateFeeSummary(
                          student.feeAssignment.amount,
                          student.feeAssignment.payments,
                          student.feeAssignment.dueDate,
                        ).balanceCents > 0,
                    );

                    return (
                      <tr
                        key={student.id}
                        className={
                          isHighlighted
                            ? "bg-emerald-50/70 hover:bg-emerald-50"
                            : "hover:bg-slate-50/75"
                        }
                      >
                        <td className="whitespace-nowrap px-6 py-4 font-mono font-medium text-slate-900">
                          {formattedId}
                          {isHighlighted && (
                            <span className="ml-2 inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                              Newly enrolled
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                          <Link
                            href={`/staff/students/${student.id}`}
                            className="font-semibold text-slate-900 underline underline-offset-4 hover:text-blue-600"
                          >
                            {student.fullName}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                          {student.programme.name}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                          {student.academicYear}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={getStatusBadgeClass(student.status)}>
                            {formatEnrolmentStatus(student.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <StudentRowActions
                            studentId={student.id}
                            studentName={student.fullName}
                            hasOutstandingBalance={hasOutstandingBalance}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function StaffStudentsPage({ searchParams }: PageProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading student directory...
              </p>
            </div>
          }
        >
          <StaffStudentsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
