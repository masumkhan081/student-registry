import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  calculateFeeSummary,
  formatGbp,
  getUtcMidnightToday,
} from "@/features/fees/calculations";
import { formatStudentId, formatDateDisplay } from "@/features/students/format";
import {
  formatUtcDateTimeDisplay,
  getGradeClassification,
} from "@/features/assessments/format";
import {
  StudentAssessmentList,
  type StudentAssessmentData,
} from "@/features/assessments/student-assessment-list";

async function DashboardContent() {
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  // =========================================================================
  // Student Workspace
  // =========================================================================
  if (identity.role === "STUDENT") {
    // Resolve student from server-side demo identity.
    // Never accept a student ID from the browser to decide whose records to show.
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

    // Query assessments matching BOTH their programme and academic year
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
        submissions: {
          where: { studentId: student.id },
          select: {
            id: true,
            originalFilename: true,
            submittedAt: true,
            size: true,
          },
        },
      },
      orderBy: { deadline: "asc" },
    });

    const formattedAssessments: StudentAssessmentData[] = assessments.map(
      (a) => {
        const sub = a.submissions[0] || null;
        return {
          id: a.id,
          title: a.title,
          module: a.module,
          deadline: a.deadline.toISOString(),
          submission: sub
            ? {
                id: sub.id,
                originalFilename: sub.originalFilename,
                submittedAt: sub.submittedAt.toISOString(),
                size: sub.size,
                isLate: sub.submittedAt.getTime() > a.deadline.getTime(),
              }
            : null,
        };
      },
    );

    // Query published results for the student marksheet section. Withheld grades are omitted.
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
      <div className="space-y-8">
        {/* Student Workspace Banner */}
        <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Demo mode · Student
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">
            Welcome, {student.fullName}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Cohort: <span className="font-semibold text-slate-800">{student.programme.name}</span> · Academic year <span className="font-semibold text-slate-800">{student.academicYear}</span>
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium">
            <Link
              href="/"
              className="text-slate-600 underline underline-offset-4 hover:text-slate-900"
            >
              Switch demo identity
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              href="/student/assessments"
              className="text-slate-600 underline underline-offset-4 hover:text-slate-900"
            >
              My assessments
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              href="/student/marksheet"
              className="text-slate-600 underline underline-offset-4 hover:text-slate-900"
            >
              My marksheet
            </Link>
          </div>
        </section>

        {/* My Assessments Section */}
        <section
          aria-labelledby="my-assessments-heading"
          className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2
                id="my-assessments-heading"
                className="text-xl font-semibold text-slate-900"
              >
                My assessments
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Coursework and assessment deadlines for your programme cohort ({student.programme.name}, {student.academicYear}).
              </p>
            </div>
            <span className="text-xs text-slate-500">
              All deadlines in UTC
            </span>
          </div>

          <div className="mt-6">
            <StudentAssessmentList initialAssessments={formattedAssessments} />
          </div>
        </section>

        {/* My Marksheet Section */}
        <section
          aria-labelledby="my-marksheet-heading"
          className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2
                id="my-marksheet-heading"
                className="text-xl font-semibold text-slate-900"
              >
                My marksheet
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Official published results and classifications for completed assessments.
              </p>
            </div>
            <Link
              href="/student/marksheet"
              className="text-xs font-semibold text-slate-700 underline underline-offset-4 hover:text-slate-900"
            >
              Full marksheet view →
            </Link>
          </div>

          <div className="mt-6">
            {publishedResults.length === 0 ? (
              <div
                role="status"
                className="rounded-lg border border-dashed border-slate-200 p-8 text-center"
              >
                <p className="text-sm font-medium text-slate-800">
                  No results published yet.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Graded coursework results will appear here once officially published by registry staff.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
                  <caption className="sr-only">
                    Published coursework marksheet
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
                        Published (UTC)
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
                            {res.publishedAt
                              ? formatUtcDateTimeDisplay(res.publishedAt)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // Staff Workspace
  // =========================================================================
  const heading = "Registry workspace";
  const description = "You are viewing the demo as Staff.";

  // Overdue criteria: dueDate strictly before today at 00:00 UTC AND outstanding balance > 0.
  // A fee due today is NOT overdue.
  const todayUtc = getUtcMidnightToday();

  const candidates = await db.student.findMany({
    where: {
      feeAssignment: {
        dueDate: {
          lt: todayUtc,
        },
      },
    },
    select: {
      id: true,
      studentNumber: true,
      enrolmentYear: true,
      fullName: true,
      programme: {
        select: { name: true },
      },
      feeAssignment: {
        select: {
          amount: true,
          dueDate: true,
          payments: {
            select: { amount: true },
          },
        },
      },
    },
    orderBy: [
      { feeAssignment: { dueDate: "asc" } },
      { studentNumber: "asc" },
    ],
  });

  const overdueStudents = candidates
    .map((student) => {
      if (!student.feeAssignment) return null;
      const summary = calculateFeeSummary(
        student.feeAssignment.amount,
        student.feeAssignment.payments,
        student.feeAssignment.dueDate,
      );

      if (!summary.isOverdue || summary.balanceCents === 0) {
        return null;
      }

      return {
        id: student.id,
        fullName: student.fullName,
        studentId: formatStudentId(student.enrolmentYear, student.studentNumber),
        programmeName: student.programme.name,
        dueDate: student.feeAssignment.dueDate,
        amountOwed: summary.outstandingBalance,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div className="space-y-8">
      {/* Workspace Banner */}
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          Demo mode · Staff
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">{heading}</h1>
        <p className="mt-3 text-slate-600">{description}</p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link
            href="/staff/students"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            View students
          </Link>

          <Link
            href="/staff/assessments"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Assessments
          </Link>

          <Link
            href="/staff/students/new"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Enrol new student
          </Link>
        </div>

        <div className="mt-6">
          <Link
            href="/"
            className="inline-block text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
          >
            Switch demo identity
          </Link>
        </div>
      </section>

      {/* Overdue Fees Section */}
      <section
        aria-labelledby="overdue-fees-heading"
        className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2
              id="overdue-fees-heading"
              className="text-xl font-semibold text-slate-900"
            >
              Overdue student fees
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                overdueStudents.length > 0
                  ? "bg-rose-100 text-rose-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {overdueStudents.length} {overdueStudents.length === 1 ? "student" : "students"}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            Boundary: strictly before today (00:00 UTC)
          </span>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Students with an outstanding fee balance whose due date has passed. Fees due today are not overdue.
        </p>

        <div className="mt-6">
          {overdueStudents.length === 0 ? (
            <div
              role="status"
              className="rounded-lg border border-dashed border-slate-200 p-8 text-center"
            >
              <p className="text-sm font-medium text-slate-800">
                No overdue student fees
              </p>
              <p className="mt-1 text-xs text-slate-500">
                All students are up to date on payments or within their fee due dates.
              </p>
            </div>
          ) : (
            <ul
              role="list"
              className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white"
            >
              {overdueStudents.map((student) => (
                <li key={student.id} className="hover:bg-slate-50 transition-colors">
                  <Link
                    href={`/staff/students/${student.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 underline underline-offset-4 hover:text-blue-600">
                          {student.fullName}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          {student.studentId}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {student.programmeName} · Due {formatDateDisplay(student.dueDate)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-medium uppercase tracking-wider text-rose-600 block">
                        Still owes
                      </span>
                      <span className="font-bold text-base text-rose-700">
                        {formatGbp(student.amountOwed)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Suspense fallback={<p role="status">Loading your workspace...</p>}>
          <DashboardContent />
        </Suspense>
      </div>
    </main>
  );
}
