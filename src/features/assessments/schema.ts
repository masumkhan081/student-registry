import { z } from "zod";
import { isConsecutiveAcademicYear } from "@/features/students/schema";
import { isValidUtcDateTimeString } from "./format";

export const createAssessmentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Assessment title is required.")
    .max(150, "Title must be 150 characters or fewer."),
  module: z
    .string()
    .trim()
    .min(1, "Module code or name is required.")
    .max(100, "Module must be 100 characters or fewer."),
  programmeId: z
    .string()
    .trim()
    .min(1, "Please select a programme."),
  academicYear: z
    .string()
    .trim()
    .min(1, "Academic year is required.")
    .regex(
      /^\d{4}\/\d{4}$/,
      "Academic year must be in YYYY/YYYY format (e.g. 2026/2027).",
    )
    .refine(
      isConsecutiveAcademicYear,
      "Academic year must be consecutive years (e.g. 2026/2027).",
    ),
  deadline: z
    .string()
    .trim()
    .min(1, "Submission deadline (UTC) is required.")
    .refine(
      isValidUtcDateTimeString,
      "Enter a valid calendar date and time in UTC (YYYY-MM-DD HH:mm).",
    ),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const gradeInputSchema = z
  .string()
  .trim()
  .min(1, "Grade is required.")
  .regex(
    /^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/,
    "Grade must be a number between 0 and 100 with at most two decimal places.",
  )
  .refine((val) => {
    const num = Number.parseFloat(val);
    return !Number.isNaN(num) && num >= 0 && num <= 100;
  }, "Grade must be between 0 and 100.");

export const saveGradeSchema = z.object({
  grade: gradeInputSchema,
  submissionUpdatedAt: z
    .string()
    .trim()
    .min(1, "submissionUpdatedAt is required."),
});

export type SaveGradeInput = z.infer<typeof saveGradeSchema>;

export const publishGradeSchema = z.object({
  expectedGrade: z.string().trim().optional(),
  expectedResultUpdatedAt: z.string().trim().optional(),
});

export type PublishGradeInput = z.infer<typeof publishGradeSchema>;

export const withholdGradeSchema = z.object({
  expectedResultUpdatedAt: z.string().trim().optional(),
});

export type WithholdGradeInput = z.infer<typeof withholdGradeSchema>;
