import { EnrolmentStatus } from "@/generated/prisma/enums";

export interface ParsedStudentId {
  enrolmentYear: number;
  studentNumber: number;
}

/**
 * Format a student ID according to the agreed format: SMS-<year>-<padded sequence>.
 * Minimum 4 digits padding; larger numbers are not truncated.
 * Example: enrolmentYear=2026, studentNumber=1 -> "SMS-2026-0001"
 */
export function formatStudentId(
  enrolmentYear: number,
  studentNumber: number,
): string {
  return `SMS-${enrolmentYear}-${String(studentNumber).padStart(4, "0")}`;
}

/**
 * Parse an exact displayed student ID (e.g. "SMS-2026-0001").
 * Case-insensitive on the "SMS-" prefix.
 * Enforces minimum 4-digit sequence format matching the canonical representation.
 */
export function parseStudentId(input: string): ParsedStudentId | null {
  const trimmed = input.trim();
  const match = /^SMS-(\d{4})-(\d+)$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const yearStr = match[1];
  const numStr = match[2];

  if (numStr.length < 4) {
    return null;
  }

  const enrolmentYear = Number.parseInt(yearStr, 10);
  const studentNumber = Number.parseInt(numStr, 10);

  if (Number.isNaN(enrolmentYear) || Number.isNaN(studentNumber)) {
    return null;
  }

  // Canonical padded check: ensures no excess leading zeros (e.g. SMS-2026-00001 for 1)
  if (String(studentNumber).padStart(4, "0") !== numStr) {
    return null;
  }

  return { enrolmentYear, studentNumber };
}

/**
 * Format enrolment status enum into a human-readable label.
 */
export function formatEnrolmentStatus(status: EnrolmentStatus): string {
  switch (status) {
    case "ENROLLED":
      return "Enrolled";
    case "DEFERRED":
      return "Deferred";
    case "WITHDRAWN":
      return "Withdrawn";
    case "COMPLETED":
      return "Completed";
  }
}

export const ENROLMENT_STATUS_OPTIONS: readonly {
  value: EnrolmentStatus;
  label: string;
}[] = [
  { value: "ENROLLED", label: "Enrolled" },
  { value: "DEFERRED", label: "Deferred" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "COMPLETED", label: "Completed" },
] as const;
