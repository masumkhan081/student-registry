"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { demoIdentitySchema, type DemoIdentity } from "./schema";

type DemoStudent = {
  id: string;
  fullName: string;
};

type Props = {
  students: DemoStudent[];
};

export function DemoAccessForm({ students }: Props) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<DemoIdentity>({
    resolver: zodResolver(demoIdentitySchema),
    defaultValues: { role: "STAFF" },
  });

  const role = useWatch({ control, name: "role" });
  const studentError =
    "studentId" in errors ? errors.studentId?.message : undefined;

  async function onSubmit(values: DemoIdentity) {
    clearErrors("root");

    try {
      const response = await fetch("/api/demo-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        setError("root", {
          message:
            response.status === 400
              ? "Choose a valid role and student."
              : "Unable to start your session. Please try again.",
        });
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("root", {
        message: "Unable to connect. Check your connection and try again.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <fieldset disabled={isSubmitting} className="space-y-5">
        <legend className="mb-3 text-sm font-semibold">
          Choose your demo role
        </legend>

        <div className="flex gap-6">
          <label className="flex items-center gap-2">
            <input type="radio" value="STAFF" {...register("role")} />
            Staff
          </label>

          <label className="flex items-center gap-2">
            <input type="radio" value="STUDENT" {...register("role")} />
            Student
          </label>
        </div>

        {role === "STUDENT" && (
          <div className="space-y-2">
            <label htmlFor="studentId" className="block text-sm font-medium">
              Demo student
            </label>

            <select
              id="studentId"
              {...register("studentId")}
              defaultValue=""
              aria-invalid={Boolean(studentError)}
              aria-describedby={studentError ? "student-error" : undefined}
              className="w-full rounded-lg border border-slate-300 bg-white p-3"
            >
              <option value="">Select a student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName}
                </option>
              ))}
            </select>

            {studentError && (
              <p
                id="student-error"
                role="alert"
                className="text-sm text-red-700"
              >
                Please select a student.
              </p>
            )}

            {students.length === 0 && (
              <p className="text-sm text-slate-600">
                No demo students are available.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={
            isSubmitting || (role === "STUDENT" && students.length === 0)
          }
          className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Opening workspace..." : "Enter demo"}
        </button>
      </fieldset>

      {errors.root?.message && (
        <p role="alert" className="text-sm text-red-700">
          {errors.root.message}
        </p>
      )}
    </form>
  );
}
