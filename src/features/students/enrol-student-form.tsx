"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  enrolStudentSchema,
  type EnrolStudentInput,
} from "./schema";
import { ENROLMENT_STATUS_OPTIONS } from "./format";

export type ProgrammeOption = {
  id: string;
  name: string;
  defaultFee: string;
};

type Props = {
  programmes: ProgrammeOption[];
};

export function EnrolStudentForm({ programmes }: Props) {
  const router = useRouter();
  const [rootError, setRootError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<EnrolStudentInput>({
    resolver: zodResolver(enrolStudentSchema),
    defaultValues: {
      fullName: "",
      email: "",
      dateOfBirth: "",
      programmeId: "",
      academicYear: "2026/2027",
      status: "ENROLLED",
      dueDate: "",
    },
  });

  const selectedProgrammeId = useWatch({ control, name: "programmeId" });
  const selectedProgramme = programmes.find(
    (p) => p.id === selectedProgrammeId,
  );

  async function onSubmit(data: EnrolStudentInput) {
    setRootError(null);
    clearErrors("root");

    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            student?: { id: string; studentId: string; fullName: string };
            error?: string;
            field?: string;
          }
        | null;

      if (!response.ok) {
        if (
          result?.field &&
          result.field in data &&
          typeof result.error === "string"
        ) {
          setError(result.field as keyof EnrolStudentInput, {
            type: "server",
            message: result.error,
          });
        } else {
          setRootError(
            result?.error ||
              "Failed to enrol student. Please check your inputs and try again.",
          );
        }
        return;
      }

      const formattedId = result?.student?.studentId;
      const targetUrl = formattedId
        ? `/staff/students?search=${encodeURIComponent(formattedId)}&enrolled=${encodeURIComponent(formattedId)}`
        : "/staff/students";

      router.push(targetUrl);
      router.refresh();
    } catch {
      setRootError("Network error. Please check your connection and try again.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header and Back Link */}
      <div>
        <Link
          href="/staff/students"
          className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
        >
          ← Back to student directory
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
          Enrol student
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Add a new student record and assign their programme fee obligation.
        </p>
      </div>

      {rootError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {rootError}
        </div>
      )}

      {/* Enrolment Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <fieldset disabled={isSubmitting} className="space-y-6">
          <legend className="sr-only">Student enrolment details</legend>

          {/* Full Name */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-slate-700"
            >
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              {...register("fullName")}
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={
                errors.fullName ? "fullName-error" : undefined
              }
              placeholder="e.g. Jordan Smith"
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {errors.fullName && (
              <p
                id="fullName-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.fullName.message}
              </p>
            )}
          </div>

          {/* Email Address */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              placeholder="e.g. jordan.smith@example.com"
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {errors.email && (
              <p
                id="email-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Date of Birth */}
          <div>
            <label
              htmlFor="dateOfBirth"
              className="block text-sm font-medium text-slate-700"
            >
              Date of birth
            </label>
            <input
              id="dateOfBirth"
              type="date"
              {...register("dateOfBirth")}
              aria-invalid={Boolean(errors.dateOfBirth)}
              aria-describedby={
                errors.dateOfBirth ? "dateOfBirth-error" : undefined
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {errors.dateOfBirth && (
              <p
                id="dateOfBirth-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.dateOfBirth.message}
              </p>
            )}
          </div>

          {/* Programme Selection */}
          <div>
            <label
              htmlFor="programmeId"
              className="block text-sm font-medium text-slate-700"
            >
              Programme
            </label>
            <select
              id="programmeId"
              {...register("programmeId")}
              aria-invalid={Boolean(errors.programmeId)}
              aria-describedby={
                errors.programmeId ? "programmeId-error" : undefined
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Select a programme</option>
              {programmes.map((programme) => (
                <option key={programme.id} value={programme.id}>
                  {programme.name}
                </option>
              ))}
            </select>
            {errors.programmeId && (
              <p
                id="programmeId-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.programmeId.message}
              </p>
            )}
          </div>

          {/* Read-Only Assigned Programme Fee */}
          <div>
            <label
              htmlFor="assignedFee"
              className="block text-sm font-medium text-slate-700"
            >
              Programme fee (assigned automatically)
            </label>
            <input
              id="assignedFee"
              type="text"
              readOnly
              aria-readonly="true"
              value={
                selectedProgramme
                  ? `£${Number(selectedProgramme.defaultFee).toFixed(2)}`
                  : "Select a programme to see the assigned fee"
              }
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-500">
              The fee amount is snapshotted from the programme&apos;s default fee upon enrolment.
            </p>
          </div>

          {/* Academic Year */}
          <div>
            <label
              htmlFor="academicYear"
              className="block text-sm font-medium text-slate-700"
            >
              Academic year
            </label>
            <input
              id="academicYear"
              type="text"
              {...register("academicYear")}
              aria-invalid={Boolean(errors.academicYear)}
              aria-describedby={
                errors.academicYear ? "academicYear-error" : undefined
              }
              placeholder="2026/2027"
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Consecutive years in YYYY/YYYY format (e.g. 2026/2027).
            </p>
            {errors.academicYear && (
              <p
                id="academicYear-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.academicYear.message}
              </p>
            )}
          </div>

          {/* Enrolment Status */}
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-slate-700"
            >
              Enrolment status
            </label>
            <select
              id="status"
              {...register("status")}
              aria-invalid={Boolean(errors.status)}
              aria-describedby={errors.status ? "status-error" : undefined}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {ENROLMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.status && (
              <p
                id="status-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.status.message}
              </p>
            )}
          </div>

          {/* Fee Due Date */}
          <div>
            <label
              htmlFor="dueDate"
              className="block text-sm font-medium text-slate-700"
            >
              Fee due date
            </label>
            <input
              id="dueDate"
              type="date"
              {...register("dueDate")}
              aria-invalid={Boolean(errors.dueDate)}
              aria-describedby={errors.dueDate ? "dueDate-error" : undefined}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Past dates are accepted for backdated enrolments.
            </p>
            {errors.dueDate && (
              <p
                id="dueDate-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.dueDate.message}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Enrolling student..." : "Enrol student"}
            </button>

            <Link
              href="/staff/students"
              className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
            >
              Cancel
            </Link>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
