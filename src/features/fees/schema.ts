import { z } from "zod";
import { isValidCalendarDate } from "@/features/students/schema";

export const recordPaymentSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Payment amount is required.")
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Amount must be a positive number with at most two decimal places.",
    )
    .refine((val) => {
      const num = Number.parseFloat(val);
      return !Number.isNaN(num) && num > 0;
    }, "Payment amount must be greater than zero."),
  paymentDate: z
    .string()
    .trim()
    .min(1, "Payment date is required.")
    .refine(isValidCalendarDate, "Enter a valid calendar date (YYYY-MM-DD)."),
  reference: z
    .string()
    .trim()
    .min(1, "Payment reference is required.")
    .max(100, "Payment reference must be 100 characters or fewer."),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
