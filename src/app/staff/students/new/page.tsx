import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";
import {
  EnrolStudentForm,
  type ProgrammeOption,
} from "@/features/students/enrol-student-form";

export const metadata: Metadata = {
  title: "Enrol student · Student Registry",
  description: "Enrol a new student and assign their programme fee obligation.",
};

async function EnrolStudentContent() {
  // Check the staff identity on the server before loading programme options
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  if (identity.role !== "STAFF") {
    redirect("/dashboard");
  }

  const rawProgrammes = await db.programme.findMany({
    select: {
      id: true,
      name: true,
      defaultFee: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const programmes: ProgrammeOption[] = rawProgrammes.map((programme) => ({
    id: programme.id,
    name: programme.name,
    defaultFee: programme.defaultFee.toFixed(2),
  }));

  return <EnrolStudentForm programmes={programmes} />;
}

export default function NewStudentPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p role="status" className="text-sm font-medium text-slate-500">
                Loading enrolment form...
              </p>
            </div>
          }
        >
          <EnrolStudentContent />
        </Suspense>
      </div>
    </main>
  );
}
