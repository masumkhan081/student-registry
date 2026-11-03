"use client";

import { useState } from "react";
import {
  formatUtcDateTimeDisplay,
  formatFileSize,
  isPastDeadline,
} from "./format";
import { SubmissionModal } from "./submission-modal";

export type StudentAssessmentData = {
  id: string;
  title: string;
  module: string;
  deadline: string;
  submission: {
    id: string;
    originalFilename: string;
    submittedAt: string;
    size: number;
    isLate: boolean;
  } | null;
};

type StudentAssessmentListProps = {
  initialAssessments: StudentAssessmentData[];
};

export function StudentAssessmentList({
  initialAssessments,
}: StudentAssessmentListProps) {
  const [assessments, setAssessments] =
    useState<StudentAssessmentData[]>(initialAssessments);
  const [activeModalAssessment, setActiveModalAssessment] =
    useState<StudentAssessmentData | null>(null);
  const [isReplacementMode, setIsReplacementMode] = useState(false);

  function openSubmitModal(
    assessment: StudentAssessmentData,
    isReplacement: boolean,
  ) {
    setActiveModalAssessment(assessment);
    setIsReplacementMode(isReplacement);
  }

  function handleSubmissionSuccess(
    assessmentId: string,
    newSubmission: {
      id: string;
      originalFilename: string;
      submittedAt: string;
      size: number;
      isLate: boolean;
    },
  ) {
    setAssessments((prev) =>
      prev.map((item) =>
        item.id === assessmentId
          ? {
              ...item,
              submission: newSubmission,
            }
          : item,
      ),
    );
  }

  if (assessments.length === 0) {
    return (
      <div
        role="status"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"
      >
        <h2 className="text-base font-semibold text-slate-900">
          No assessments scheduled
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          There are currently no assessments assigned for your programme and
          academic year cohort.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
          <caption className="sr-only">
            Coursework and assessment deadlines
          </caption>
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th scope="col" className="px-6 py-3.5">
                Title & Module
              </th>
              <th scope="col" className="px-6 py-3.5">
                Submission deadline (UTC)
              </th>
              <th scope="col" className="px-6 py-3.5">
                Status
              </th>
              <th scope="col" className="px-6 py-3.5 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {assessments.map((item) => {
              const pastDeadline = isPastDeadline(item.deadline);
              const submission = item.submission;
              const hasSubmission = Boolean(submission);

              return (
                <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                  {/* Title & Module */}
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {item.module}
                    </div>
                    {/* Submission metadata when submitted */}
                    {submission && (
                      <div className="mt-2 text-xs text-slate-600">
                        <span className="font-medium text-slate-900">
                          📄 {submission.originalFilename}
                        </span>{" "}
                        <span className="text-slate-400 font-mono">
                          ({formatFileSize(submission.size)})
                        </span>
                        <div className="mt-0.5 text-slate-500">
                          Submitted: {formatUtcDateTimeDisplay(submission.submittedAt)}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Submission deadline */}
                  <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-900">
                    {formatUtcDateTimeDisplay(item.deadline)}
                  </td>

                  {/* Status */}
                  <td className="whitespace-nowrap px-6 py-4">
                    {hasSubmission && submission ? (
                      submission.isLate ? (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                          Late
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          On time
                        </span>
                      )
                    ) : pastDeadline ? (
                      <span className="inline-flex items-center rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 ring-1 ring-inset ring-rose-600/20">
                        Past deadline
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                        Not submitted
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      {hasSubmission ? (
                        <>
                          {/* Download submitted file */}
                          <a
                            href={`/api/assessments/${item.id}/submission/download`}
                            download
                            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900"
                            aria-label={`Download ${submission?.originalFilename || "submission"}`}
                          >
                            Download
                          </a>

                          {/* Replace file: ONLY strictly before deadline */}
                          {!pastDeadline ? (
                            <button
                              type="button"
                              onClick={() => openSubmitModal(item, true)}
                              className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                              aria-label={`Replace file for ${item.title}`}
                            >
                              Replace file
                            </button>
                          ) : (
                            <span
                              className="text-xs text-slate-400 italic"
                              title="Replacements are closed after deadline"
                            >
                              Replacements closed
                            </span>
                          )}
                        </>
                      ) : (
                        /* Submit work button */
                        <button
                          type="button"
                          onClick={() => openSubmitModal(item, false)}
                          className="inline-flex items-center rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          aria-label={`Submit work for ${item.title}`}
                        >
                          {pastDeadline ? "Submit work (Late)" : "Submit work"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Submission Modal Dialog */}
      {activeModalAssessment && (
        <SubmissionModal
          assessment={activeModalAssessment}
          isReplacement={isReplacementMode}
          isOpen={Boolean(activeModalAssessment)}
          onClose={() => setActiveModalAssessment(null)}
          onSuccess={(newSub) =>
            handleSubmissionSuccess(activeModalAssessment.id, newSub)
          }
        />
      )}
    </>
  );
}
