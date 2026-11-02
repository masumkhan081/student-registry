import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoIdentity } from "@/lib/demo-session";
import { db } from "@/lib/db";

async function DashboardContent() {
  const identity = await getDemoIdentity();

  if (!identity) {
    redirect("/");
  }

  let heading = "Registry workspace";
  let description = "You are viewing the demo as Staff.";

  if (identity.role === "STUDENT") {
    const student = await db.student.findUnique({
      where: { id: identity.studentId },
      select: { fullName: true },
    });

    if (!student) {
      redirect("/");
    }

    heading = `Welcome, ${student.fullName}`;
    description = "You are viewing your student workspace.";
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8">
      <p className="text-sm font-medium text-slate-500">
        Demo mode · {identity.role === "STAFF" ? "Staff" : "Student"}
      </p>
      <h1 className="mt-3 text-3xl font-semibold">{heading}</h1>
      <p className="mt-3 text-slate-600">{description}</p>

      {identity.role === "STAFF" && (
        <div className="mt-6">
          <Link
            href="/staff/students"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            View students
          </Link>
        </div>
      )}

      <div className="mt-6">
        <Link
          href="/"
          className="inline-block font-medium underline underline-offset-4"
        >
          Switch demo identity
        </Link>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <Suspense fallback={<p role="status">Loading your workspace...</p>}>
          <DashboardContent />
        </Suspense>
      </div>
    </main>
  );
}
