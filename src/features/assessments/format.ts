/**
 * Utilities for strictly UTC-based datetime handling.
 * Prevents browser/server local timezone drift for assessment deadlines.
 */

export function formatUtcDateTimeDisplay(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

/**
 * Validates and parses a datetime string strictly into UTC.
 * Accepts ISO format (YYYY-MM-DDTHH:mm) as provided by HTML datetime-local inputs,
 * or space-separated (YYYY-MM-DD HH:mm).
 */
export function parseUtcDateTime(input: string): Date | null {
  const trimmed = input.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/i.exec(
    trimmed,
  );
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hours = Number.parseInt(match[4], 10);
  const minutes = Number.parseInt(match[5], 10);
  const seconds = match[6] ? Number.parseInt(match[6], 10) : 0;

  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }

  const date = new Date(
    Date.UTC(year, month - 1, day, hours, minutes, seconds, 0),
  );

  // Calendar validity check (leap years, 30 vs 31 days)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isValidUtcDateTimeString(input: string): boolean {
  return parseUtcDateTime(input) !== null;
}

/**
 * Check if a submission deadline is past server time.
 */
export function isPastDeadline(
  deadlineInput: Date | string,
  now: Date = new Date(),
): boolean {
  const deadline =
    typeof deadlineInput === "string" ? new Date(deadlineInput) : deadlineInput;
  return deadline.getTime() < now.getTime();
}

/**
 * Check if a submission was submitted after the deadline.
 */
export function isSubmissionLate(
  submittedAtInput: Date | string,
  deadlineInput: Date | string,
): boolean {
  const submittedAt =
    typeof submittedAtInput === "string"
      ? new Date(submittedAtInput)
      : submittedAtInput;
  const deadline =
    typeof deadlineInput === "string" ? new Date(deadlineInput) : deadlineInput;
  return submittedAt.getTime() > deadline.getTime();
}

/**
 * Format bytes into human-readable size (e.g. 512 KB, 2.4 MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
