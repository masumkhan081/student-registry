"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordPaymentSchema, type RecordPaymentInput } from "./schema";
import {
  calculateFeeSummary,
  formatGbp,
} from "./calculations";
import { formatDateDisplay, formatDateInputValue } from "@/features/students/format";

export interface SerializedPayment {
  id: string;
  amount: string;
  paymentDate: string; // ISO date string or YYYY-MM-DD
  reference: string;
  createdAt: string;
}

export interface SerializedFeeAssignment {
  id: string;
  amount: string;
  dueDate: string; // ISO date string or YYYY-MM-DD
}

interface Props {
  studentId: string;
  feeAssignment: SerializedFeeAssignment;
  initialPayments: SerializedPayment[];
}

export function StudentFeeSection({
  studentId,
  feeAssignment,
  initialPayments,
}: Props) {
  const router = useRouter();
  const [payments, setPayments] = useState<SerializedPayment[]>(initialPayments);
  const [rootError, setRootError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const defaultDate = formatDateInputValue(new Date());

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: "",
      paymentDate: defaultDate,
      reference: "",
    },
  });

  // Calculate live summary using decimal-safe arithmetic
  const summary = calculateFeeSummary(
    feeAssignment.amount,
    payments,
    feeAssignment.dueDate,
  );

  async function onSubmit(data: RecordPaymentInput) {
    setRootError(null);
    setSuccessMessage(null);
    clearErrors();

    try {
      const response = await fetch(`/api/students/${studentId}/payments`, {
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
          (result.field === "amount" ||
            result.field === "paymentDate" ||
            result.field === "reference") &&
          typeof result.error === "string"
        ) {
          setError(result.field, {
            type: "server",
            message: result.error,
          });
        } else {
          setRootError(
            result?.error || "Failed to record payment. Please review your entries.",
          );
        }
        return;
      }

      // Success: Prepend new payment to state (newest first)
      if (result?.payment) {
        setPayments((prev) => [result.payment, ...prev]);
        setSuccessMessage(
          `Payment of £${Number(result.payment.amount).toFixed(2)} recorded successfully (Ref: ${result.payment.reference}).`,
        );
      }

      // Clear the amount and reference and restore the default payment date
      reset({
        amount: "",
        paymentDate: formatDateInputValue(new Date()),
        reference: "",
      });

      // Background refresh so server components sync without full-page navigation
      router.refresh();
    } catch {
      setRootError("Network error. Please check your connection and try again.");
    }
  }

  return (
    <section aria-labelledby="fees-payments-heading" className="space-y-6">
      {/* Financial Overview Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="fees-payments-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Fees & Balance
          </h2>
          <div>
            {summary.isPaidInFull ? (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                Paid in full
              </span>
            ) : summary.isOverdue ? (
              <span className="inline-flex items-center rounded-md bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Payment overdue
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Outstanding balance
              </span>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Assigned fee
            </dt>
            <dd className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
              {formatGbp(summary.assignedFee)}
            </dd>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total paid
            </dt>
            <dd className="mt-1.5 text-2xl font-semibold tracking-tight text-emerald-700">
              {formatGbp(summary.totalPaid)}
            </dd>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Outstanding balance
            </dt>
            <dd
              className={`mt-1.5 text-2xl font-semibold tracking-tight ${
                summary.balanceCents > 0
                  ? summary.isOverdue
                    ? "text-rose-600"
                    : "text-slate-900"
                  : "text-slate-400"
              }`}
            >
              {formatGbp(summary.outstandingBalance)}
            </dd>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Fee due date
            </dt>
            <dd className="mt-1.5 text-base font-semibold text-slate-900">
              {formatDateDisplay(feeAssignment.dueDate)}
            </dd>
            <p className="mt-0.5 text-xs text-slate-500">
              Evaluated at 00:00 UTC
            </p>
          </div>
        </dl>
      </div>

      {/* Record Payment Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          Record Payment
        </h3>

        {summary.isPaidInFull ? (
          <div
            role="status"
            className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <svg
              className="h-5 w-5 text-emerald-600 flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-semibold text-emerald-800">Paid in full</p>
              <p className="mt-0.5 text-emerald-700">
                The fee obligation of {formatGbp(summary.assignedFee)} is completely settled. No additional payments can be recorded.
              </p>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="mt-4 space-y-4"
          >
            {rootError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
              >
                {rootError}
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800"
              >
                {successMessage}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Payment Amount */}
              <div>
                <label
                  htmlFor="payment-amount"
                  className="block text-sm font-medium text-slate-700"
                >
                  Amount (£) <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-500">
                    £
                  </span>
                  <input
                    id="payment-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...register("amount")}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={
                      errors.amount ? "payment-amount-error" : "payment-amount-hint"
                    }
                    className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                  />
                </div>
                <p id="payment-amount-hint" className="mt-1 text-xs text-slate-500">
                  Up to {formatGbp(summary.outstandingBalance)}
                </p>
                {errors.amount && (
                  <p
                    id="payment-amount-error"
                    role="alert"
                    className="mt-1 text-xs text-red-600"
                  >
                    {errors.amount.message}
                  </p>
                )}
              </div>

              {/* Payment Date */}
              <div>
                <label
                  htmlFor="payment-date"
                  className="block text-sm font-medium text-slate-700"
                >
                  Payment date <span className="text-red-500">*</span>
                </label>
                <input
                  id="payment-date"
                  type="date"
                  {...register("paymentDate")}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.paymentDate)}
                  aria-describedby={
                    errors.paymentDate ? "payment-date-error" : undefined
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                />
                {errors.paymentDate && (
                  <p
                    id="payment-date-error"
                    role="alert"
                    className="mt-1 text-xs text-red-600"
                  >
                    {errors.paymentDate.message}
                  </p>
                )}
              </div>

              {/* Reference */}
              <div>
                <label
                  htmlFor="payment-reference"
                  className="block text-sm font-medium text-slate-700"
                >
                  Reference <span className="text-red-500">*</span>
                </label>
                <input
                  id="payment-reference"
                  type="text"
                  placeholder="e.g. BACS-4821"
                  {...register("reference")}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.reference)}
                  aria-describedby={
                    errors.reference ? "payment-reference-error" : undefined
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
                />
                {errors.reference && (
                  <p
                    id="payment-reference-error"
                    role="alert"
                    className="mt-1 text-xs text-red-600"
                  >
                    {errors.reference.message}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Recording payment..." : "Record payment"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Payment History Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Payment History
          </h3>
          <span className="text-xs font-medium text-slate-500">
            {payments.length} {payments.length === 1 ? "payment" : "payments"} recorded
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">
              No payments have been recorded for this student.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Payment date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Reference
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/75">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                      {formatDateDisplay(p.paymentDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-emerald-700">
                      {formatGbp(p.amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                      {p.reference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
