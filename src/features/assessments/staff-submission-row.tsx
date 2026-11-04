"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  formatUtcDateTimeDisplay,
  formatFileSize,
  getGradeClassification,
  type GradeClassification,
} from "./format";
import { gradeInputSchema } from "./schema";

const gradeFormSchema = z.object({
  grade: gradeInputSchema,
});

type GradeFormData = z.infer<typeof gradeFormSchema>;

export type StaffSubmissionItem = {
  id: string;
  studentId: string;
  studentName: string;
  formattedStudentId: string;
  originalFilename: string;
  size: number;
  submittedAt: string;
  updatedAt: string;
  isLate: boolean;
  result: {
    id: string;
    grade: string;
    classification: GradeClassification;
    publishedAt: string | null;
    updatedAt: string;
  } | null;
};

type StaffSubmissionRowProps = {
  submission: StaffSubmissionItem;
  assessmentTitle: string;
};

export function StaffSubmissionRow({
  submission: initialSubmission,
  assessmentTitle,
}: StaffSubmissionRowProps) {
  const [submission, setSubmission] =
    useState<StaffSubmissionItem>(initialSubmission);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isWithholding, setIsWithholding] = useState(false);

  const result = submission.result;
  const isUngraded = !result;
  const isPublished = Boolean(result?.publishedAt);
  const isWithheld = Boolean(result && !result.publishedAt);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<GradeFormData>({
    resolver: zodResolver(gradeFormSchema),
    defaultValues: {
      grade: result ? result.grade : "",
    },
    values: {
      grade: result ? result.grade : "",
    },
  });

  async function onSaveGrade(data: GradeFormData) {
    setIsSaving(true);
    setServerError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/submissions/${submission.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: data.grade,
          submissionUpdatedAt: submission.updatedAt,
          expectedResultUpdatedAt: result ? result.updatedAt : undefined,
        }),
      });

      const resData = await res.json();

      if (!res.ok) {
        setServerError(
          resData.error || "Failed to save grade. Please check input.",
        );
        setIsSaving(false);
        return;
      }

      const updatedResult = resData.result;
      const classification = getGradeClassification(updatedResult.grade);

      setSubmission((prev) => ({
        ...prev,
        result: {
          id: updatedResult.id,
          grade: updatedResult.grade,
          classification,
          publishedAt: updatedResult.publishedAt,
          updatedAt: updatedResult.updatedAt,
        },
      }));

      reset({ grade: updatedResult.grade });
      setSuccessMessage(
        updatedResult.publishedAt
          ? `Grade saved (${updatedResult.grade} · ${classification}) - publication preserved.`
          : `Grade saved as Withheld (${updatedResult.grade} · ${classification}).`,
      );
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "An unexpected network error occurred.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function onPublish() {
    if (!result) return;
    setIsPublishing(true);
    setServerError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/submissions/${submission.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedGrade: result.grade,
          expectedResultUpdatedAt: result.updatedAt,
        }),
      });

      const resData = await res.json();

      if (!res.ok) {
        setServerError(
          resData.error || "Failed to publish grade. Please refresh.",
        );
        setIsPublishing(false);
        return;
      }

      const updatedResult = resData.result;
      setSubmission((prev) => ({
        ...prev,
        result: {
          ...result,
          publishedAt: updatedResult.publishedAt,
          updatedAt: updatedResult.updatedAt,
        },
      }));

      setSuccessMessage("Grade published. It is now visible on the student's marksheet.");
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "An unexpected network error occurred.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function onWithhold() {
    if (!result) return;
    setIsWithholding(true);
    setServerError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/submissions/${submission.id}/withhold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedResultUpdatedAt: result.updatedAt,
        }),
      });

      const resData = await res.json();

      if (!res.ok) {
        setServerError(
          resData.error || "Failed to withhold grade. Please refresh.",
        );
        setIsWithholding(false);
        return;
      }

      const updatedResult = resData.result;
      setSubmission((prev) => ({
        ...prev,
        result: {
          ...result,
          publishedAt: null,
          updatedAt: updatedResult.updatedAt,
        },
      }));

      setSuccessMessage("Grade withheld. It is now hidden from the student marksheet.");
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "An unexpected network error occurred.",
      );
    } finally {
      setIsWithholding(false);
    }
  }

  return (
    <tr className="hover:bg-slate-50/75 transition-colors align-top">
      {/* Student Details */}
      <td className="px-6 py-4">
        <div className="font-semibold text-slate-900">
          {submission.studentName}
        </div>
        <div className="font-mono text-xs text-slate-500">
          {submission.formattedStudentId}
        </div>
      </td>

      {/* Submitted File & Download Action */}
      <td className="px-6 py-4">
        <div className="font-medium text-slate-900 truncate max-w-xs">
          📄 {submission.originalFilename}
        </div>
        <div className="text-xs text-slate-500 font-mono mt-0.5">
          {formatFileSize(submission.size)}
        </div>
        <div className="mt-1.5">
          <a
            href={`/api/submissions/${submission.id}/download`}
            download
            className="inline-flex items-center text-xs font-semibold text-slate-700 underline underline-offset-4 hover:text-slate-900"
            aria-label={`Download ${submission.originalFilename} for ${submission.studentName}`}
          >
            Download work ↓
          </a>
        </div>
      </td>

      {/* Submission Time & Lateness */}
      <td className="whitespace-nowrap px-6 py-4">
        <div className="font-mono text-xs text-slate-900">
          {formatUtcDateTimeDisplay(submission.submittedAt)}
        </div>
        <div className="mt-1">
          {submission.isLate ? (
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
              Late
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              On time
            </span>
          )}
        </div>
      </td>

      {/* Grading State */}
      <td className="whitespace-nowrap px-6 py-4">
        {isUngraded && (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
            Ungraded
          </span>
        )}
        {isWithheld && (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
            Withheld
          </span>
        )}
        {isPublished && (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            Published
          </span>
        )}
        {result && (
          <div className="mt-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{result.grade}%</span>{" "}
            · <span className="font-medium">{result.classification}</span>
          </div>
        )}
      </td>

      {/* Grade Form & Publication Actions */}
      <td className="px-6 py-4 text-right">
        <div className="flex flex-col items-end gap-2">
          {/* Grade Input Form */}
          <form
            onSubmit={handleSubmit(onSaveGrade)}
            className="flex items-center justify-end gap-2"
          >
            <div>
              <label
                htmlFor={`grade-input-${submission.id}`}
                className="sr-only"
              >
                Grade for {submission.studentName} ({assessmentTitle})
              </label>
              <input
                id={`grade-input-${submission.id}`}
                type="text"
                step="0.01"
                min="0"
                max="100"
                placeholder="0.00"
                disabled={isSaving || isPublishing || isWithholding}
                {...register("grade")}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right font-mono text-xs text-slate-900 shadow-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || isPublishing || isWithholding}
              className="inline-flex items-center rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save grade"}
            </button>
          </form>

          {/* Validation error for grade */}
          {errors.grade && (
            <p className="text-xs text-rose-600 font-medium">
              {errors.grade.message}
            </p>
          )}

          {/* Explicit Publication Actions */}
          {result && (
            <div className="flex items-center gap-2 pt-1">
              {isWithheld && (
                <button
                  type="button"
                  onClick={onPublish}
                  disabled={isPublishing || isSaving}
                  className="inline-flex items-center rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-50"
                  aria-label={`Publish grade for ${submission.studentName}`}
                >
                  {isPublishing ? "Publishing..." : "Publish"}
                </button>
              )}
              {isPublished && (
                <button
                  type="button"
                  onClick={onWithhold}
                  disabled={isWithholding || isSaving}
                  className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50"
                  aria-label={`Withhold grade for ${submission.studentName}`}
                >
                  {isWithholding ? "Withholding..." : "Withhold"}
                </button>
              )}
            </div>
          )}

          {/* Feedback Messages */}
          {serverError && (
            <div
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 p-2 text-left text-xs text-rose-800 max-w-xs"
            >
              <p className="font-semibold text-rose-900">Action blocked</p>
              <p className="mt-0.5">{serverError}</p>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-md bg-emerald-50 px-2 py-1 text-left text-xs font-medium text-emerald-800 max-w-xs"
            >
              ✓ {successMessage}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
