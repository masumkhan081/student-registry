import { Suspense } from "react";
import { db } from "@/lib/db";
import { DemoAccessForm } from "@/features/demo/demo-access-form";
import { demoStudentIds } from "@/features/demo/demo-students";

async function DemoAccess() {
  const students = await db.student.findMany({
    where: { id: { in: demoStudentIds } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  return <DemoAccessForm students={students} />;
}

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Student Registry</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Explore the registry
        </h1>
        <p className="mb-8 mt-3 text-sm leading-6 text-slate-600">
          Choose Staff to manage registry workflows, or a Student to explore
          their experience. This demo uses fictional records and does not
          require a password.
        </p>

        <Suspense fallback={<p role="status">Loading demo students...</p>}>
          <DemoAccess />
        </Suspense>
      </section>
    </main>
  );
}
