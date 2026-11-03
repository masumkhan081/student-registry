import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  StudentAssessmentList,
  type StudentAssessmentData,
} from "@/features/assessments/student-assessment-list";

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

  const formattedAssessments: StudentAssessmentData[] = assessments.map((a) => {
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
            My assessments
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cohort: <span className="font-semibold text-slate-800">{student.programme.name}</span> · Academic year <span className="font-semibold text-slate-800">{student.academicYear}</span>
          </p>
        </div>
      </div>

      {/* Assessment List */}
      <StudentAssessmentList initialAssessments={formattedAssessments} />
    </div>
  );
}

export default function StudentAssessmentsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
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
