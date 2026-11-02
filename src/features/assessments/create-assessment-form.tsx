"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createAssessmentSchema,
  type CreateAssessmentInput,
} from "./schema";

export type ProgrammeOption = {
  id: string;
  name: string;
};

type Props = {
  programmes: ProgrammeOption[];
};

export function CreateAssessmentForm({ programmes }: Props) {
  const router = useRouter();
  const [rootError, setRootError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<CreateAssessmentInput>({
    resolver: zodResolver(createAssessmentSchema),
    defaultValues: {
      title: "",
      module: "",
      programmeId: "",
      academicYear: "2026/2027",
      deadline: "",
    },
  });

  async function onSubmit(data: CreateAssessmentInput) {
    setRootError(null);
    clearErrors();

    try {
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        if (
          result?.field &&
          result.field in data &&
          typeof result.error === "string"
        ) {
          setError(result.field as keyof CreateAssessmentInput, {
            type: "server",
            message: result.error,
          });
        } else {
          setRootError(
            result?.error ||
              "Failed to create assessment. Please review your entries.",
          );
        }
        return;
      }

      // Success: Redirect to staff assessments directory
      router.push("/staff/assessments?created=true");
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
          href="/staff/assessments"
          className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
        >
          ← Back to assessments
        </Link>
        <div className="mt-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Create assessment
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Define a coursework or examination deadline for a specific programme cohort.
          </p>
        </div>
      </div>

      {rootError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {rootError}
        </div>
      )}

      {/* Form Card */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <fieldset disabled={isSubmitting} className="space-y-6">
          <legend className="sr-only">Assessment Details</legend>

          {/* Assessment Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-slate-700"
            >
              Assessment title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              placeholder="e.g. Web Applications Architecture Project"
              {...register("title")}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "title-error" : undefined}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {errors.title && (
              <p
                id="title-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Module */}
          <div>
            <label
              htmlFor="module"
              className="block text-sm font-medium text-slate-700"
            >
              Module <span className="text-red-500">*</span>
            </label>
            <input
              id="module"
              type="text"
              placeholder="e.g. CS204 Advanced Web Development"
              {...register("module")}
              aria-invalid={Boolean(errors.module)}
              aria-describedby={errors.module ? "module-error" : undefined}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {errors.module && (
              <p
                id="module-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.module.message}
              </p>
            )}
          </div>

          {/* Programme Selection */}
          <div>
            <label
              htmlFor="programmeId"
              className="block text-sm font-medium text-slate-700"
            >
              Programme <span className="text-red-500">*</span>
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
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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

          {/* Academic Year */}
          <div>
            <label
              htmlFor="academicYear"
              className="block text-sm font-medium text-slate-700"
            >
              Academic year <span className="text-red-500">*</span>
            </label>
            <input
              id="academicYear"
              type="text"
              placeholder="2026/2027"
              {...register("academicYear")}
              aria-invalid={Boolean(errors.academicYear)}
              aria-describedby={
                errors.academicYear ? "academicYear-error" : "academicYear-hint"
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <p id="academicYear-hint" className="mt-1 text-xs text-slate-500">
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

          {/* Submission Deadline (UTC) */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="deadline"
                className="block text-sm font-medium text-slate-700"
              >
                Submission deadline (UTC) <span className="text-red-500">*</span>
              </label>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                UTC timezone
              </span>
            </div>
            <input
              id="deadline"
              type="datetime-local"
              step="60"
              {...register("deadline")}
              aria-invalid={Boolean(errors.deadline)}
              aria-describedby={
                errors.deadline ? "deadline-error" : "deadline-hint"
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <p id="deadline-hint" className="mt-1 text-xs text-slate-500">
              Specify the deadline strictly in UTC (Coordinated Universal Time). It will not be shifted by browser timezone.
            </p>
            {errors.deadline && (
              <p
                id="deadline-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600"
              >
                {errors.deadline.message}
              </p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Creating assessment..." : "Create assessment"}
            </button>

            <Link
              href="/staff/assessments"
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
