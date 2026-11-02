"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateStudentSchema,
  type UpdateStudentInput,
} from "./schema";
import {
  formatStudentId,
  ENROLMENT_STATUS_OPTIONS,
} from "./format";
import type { EnrolmentStatus } from "@/generated/prisma/enums";

export type ProgrammeOption = {
  id: string;
  name: string;
  defaultFee: string;
};

export type EditableStudent = {
  id: string;
  studentNumber: number;
  enrolmentYear: number;
  fullName: string;
  email: string;
  dateOfBirth: string; // YYYY-MM-DD
  programmeId: string;
  academicYear: string;
  status: EnrolmentStatus;
  feeAssignment: {
    amount: string;
    dueDate: string; // YYYY-MM-DD
  } | null;
  hasHistory: boolean;
  lockReason?: string;
};

type Props = {
  student: EditableStudent;
  programmes: ProgrammeOption[];
};

export function EditStudentForm({ student, programmes }: Props) {
  const router = useRouter();
  const [rootError, setRootError] = useState<string | null>(null);

  const formattedId = formatStudentId(
    student.enrolmentYear,
    student.studentNumber,
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<UpdateStudentInput>({
    resolver: zodResolver(updateStudentSchema),
    defaultValues: {
      fullName: student.fullName,
      email: student.email,
      dateOfBirth: student.dateOfBirth,
      programmeId: student.programmeId,
      academicYear: student.academicYear,
      status: student.status,
      dueDate: student.feeAssignment?.dueDate ?? "",
    },
  });

  const selectedProgrammeId = useWatch({ control, name: "programmeId" });
  const selectedProgramme = programmes.find(
    (p) => p.id === selectedProgrammeId,
  );

  const isProgrammeChanging =
    selectedProgrammeId !== undefined &&
    selectedProgrammeId !== student.programmeId;

  async function onSubmit(data: UpdateStudentInput) {
    setRootError(null);
    clearErrors("root");

    // If programme and academic year are locked, ensure submitted payload matches saved values
    const payload: UpdateStudentInput = {
      ...data,
      programmeId: student.hasHistory ? student.programmeId : data.programmeId,
      academicYear: student.hasHistory
        ? student.academicYear
        : data.academicYear,
    };

    try {
      const response = await fetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
          result.field in payload &&
          typeof result.error === "string"
        ) {
          setError(result.field as keyof UpdateStudentInput, {
            type: "server",
            message: result.error,
          });
        } else {
          setRootError(
            result?.error ||
              "Failed to update student record. Please check your inputs.",
          );
        }
        return;
      }

      router.push(`/staff/students/${student.id}?updated=true`);
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
          href={`/staff/students/${student.id}`}
          className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900"
        >
          ← Back to student details
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Edit student
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Update personal details, enrolment status, or programme
              corrections for <span className="font-semibold">{student.fullName}</span>.
            </p>
          </div>
          <span className="font-mono text-sm font-medium text-slate-500">
            {formattedId}
          </span>
        </div>
      </div>

      {/* History Lock Banner */}
      {student.hasHistory && (
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold text-amber-800">
            Programme and academic year locked
          </p>
          <p className="mt-1 text-amber-700">
            {student.lockReason ||
              "This student has recorded payments or assessment submissions. Programme and academic year can no longer be changed, but personal details and enrolment status can still be edited."}
          </p>
        </div>
      )}

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
          <legend className="sr-only">Edit student details</legend>

          {/* Immutable Student ID Display */}
          <div>
            <label
              htmlFor="studentNumberDisplay"
              className="block text-sm font-medium text-slate-700"
            >
              Student ID (immutable)
            </label>
            <input
              id="studentNumberDisplay"
              type="text"
              readOnly
              aria-readonly="true"
              value={formattedId}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-500">
              Allocated at enrolment; permanently fixed across all academic years.
            </p>
          </div>

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
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
            <div className="flex items-center justify-between">
              <label
                htmlFor="programmeId"
                className="block text-sm font-medium text-slate-700"
              >
                Programme
              </label>
              {student.hasHistory && (
                <span className="text-xs font-semibold text-amber-700">
                  Locked
                </span>
              )}
            </div>
            <select
              id="programmeId"
              {...register("programmeId")}
              disabled={student.hasHistory}
              aria-invalid={Boolean(errors.programmeId)}
              aria-describedby={
                errors.programmeId ? "programmeId-error" : undefined
              }
              className={`mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${
                student.hasHistory
                  ? "bg-slate-100 text-slate-600 cursor-not-allowed"
                  : "bg-white text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              }`}
            >
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

          {/* Assigned Fee Preview */}
          <div>
            <label
              htmlFor="assignedFeeDisplay"
              className="block text-sm font-medium text-slate-700"
            >
              Assigned programme fee (snapshot)
            </label>
            <input
              id="assignedFeeDisplay"
              type="text"
              readOnly
              aria-readonly="true"
              value={
                isProgrammeChanging && selectedProgramme
                  ? `£${Number(selectedProgramme.defaultFee).toFixed(2)} (New fee upon saving)`
                  : student.feeAssignment
                    ? `£${Number(student.feeAssignment.amount).toFixed(2)}`
                    : "None assigned"
              }
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-slate-500">
              {isProgrammeChanging && selectedProgramme
                ? `Changing programme will update the assigned fee to £${Number(selectedProgramme.defaultFee).toFixed(2)} in the same transaction.`
                : "Editing only personal details, status or academic year preserves the existing fee snapshot."}
            </p>
          </div>

          {/* Academic Year */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="academicYear"
                className="block text-sm font-medium text-slate-700"
              >
                Academic year
              </label>
              {student.hasHistory && (
                <span className="text-xs font-semibold text-amber-700">
                  Locked
                </span>
              )}
            </div>
            <input
              id="academicYear"
              type="text"
              {...register("academicYear")}
              disabled={student.hasHistory}
              aria-invalid={Boolean(errors.academicYear)}
              aria-describedby={
                errors.academicYear ? "academicYear-error" : undefined
              }
              className={`mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${
                student.hasHistory
                  ? "bg-slate-100 text-slate-600 cursor-not-allowed"
                  : "bg-white text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              }`}
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

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Saving changes..." : "Save changes"}
            </button>

            <Link
              href={`/staff/students/${student.id}`}
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
