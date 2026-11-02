import { z } from "zod";
import { EnrolmentStatus } from "@/generated/prisma/enums";

export const studentFilterSchema = z.object({
  search: z.string().trim().max(100).optional(),
  programme: z.string().trim().max(100).optional(),
  status: z.nativeEnum(EnrolmentStatus).optional(),
});

export type StudentFilters = z.infer<typeof studentFilterSchema>;

function getFirstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function cleanParam(
  value: string | string[] | undefined,
): string | undefined {
  const single = getFirstParam(value);
  if (!single) {
    return undefined;
  }
  const trimmed = single.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseStudentFilters(
  raw: Record<string, string | string[] | undefined>,
): StudentFilters {
  const search =
    cleanParam(raw.search) ??
    cleanParam(raw.q) ??
    cleanParam(raw.name) ??
    cleanParam(raw.studentId);
  const programme = cleanParam(raw.programme) ?? cleanParam(raw.programmeId);
  const rawStatus = cleanParam(raw.status);

  let status: EnrolmentStatus | undefined = undefined;
  if (rawStatus) {
    const upper = rawStatus.toUpperCase();
    if (upper in EnrolmentStatus) {
      status = upper as EnrolmentStatus;
    }
  }

  const result = studentFilterSchema.safeParse({
    search,
    programme,
    status,
  });

  if (result.success) {
    return result.data;
  }

  return {
    search: search ? search.slice(0, 100) : undefined,
    programme: programme ? programme.slice(0, 100) : undefined,
    status,
  };
}

export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  if (year < 1900 || year > 2100) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isNotFutureDate(dateStr: string): boolean {
  if (!isValidCalendarDate(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  const dateUtc = Date.UTC(year, month - 1, day);
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return dateUtc <= todayUtc;
}

export function isConsecutiveAcademicYear(academicYear: string): boolean {
  const match = /^(\d{4})\/(\d{4})$/.exec(academicYear);
  if (!match) {
    return false;
  }
  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  return end === start + 1;
}

export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export const enrolStudentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required.")
    .max(100, "Full name must be 100 characters or fewer."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(150, "Email must be 150 characters or fewer."),
  dateOfBirth: z
    .string()
    .trim()
    .min(1, "Date of birth is required.")
    .refine(isValidCalendarDate, "Enter a valid calendar date (YYYY-MM-DD).")
    .refine(isNotFutureDate, "Date of birth cannot be in the future."),
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
  status: z.nativeEnum(EnrolmentStatus, {
    message: "Select a valid enrolment status.",
  }),
  dueDate: z
    .string()
    .trim()
    .min(1, "Fee due date is required.")
    .refine(isValidCalendarDate, "Enter a valid calendar date (YYYY-MM-DD)."),
});

export type EnrolStudentInput = z.infer<typeof enrolStudentSchema>;
