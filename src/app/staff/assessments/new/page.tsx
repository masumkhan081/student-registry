import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  CreateAssessmentForm,
  type ProgrammeOption,
} from "@/features/assessments/create-assessment-form";

export const metadata: Metadata = {
  title: "Create assessment · Student Registry",
  description: "Create a new assessment for a programme cohort.",
};

async function CreateAssessmentContent() {
  // 1. Guard page on the server before querying database
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STAFF") {
    redirect("/dashboard");
  }

  // 2. Fetch programme options for the form dropdown
  const rawProgrammes = await db.programme.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const programmes: ProgrammeOption[] = rawProgrammes.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return <CreateAssessmentForm programmes={programmes} />;
}

export default function NewAssessmentPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading assessment form...
              </p>
            </div>
          }
        >
          <CreateAssessmentContent />
        </Suspense>
      </div>
    </main>
  );
}
