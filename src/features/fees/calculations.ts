export interface FeeSummary {
  assignedFee: string;
  totalPaid: string;
  outstandingBalance: string;
  isPaidInFull: boolean;
  isOverdue: boolean;
  assignedFeeCents: number;
  totalPaidCents: number;
  balanceCents: number;
}

/**
 * Parses any monetary input (string, number, or object with toString like Prisma.Decimal)
 * into exact integer cents (number) to ensure decimal-safe arithmetic.
 * Uses string splitting to avoid binary floating-point parse errors.
 */
export function parseCents(amount: string | number | { toString(): string }): number {
  const str = typeof amount === "string" ? amount.trim() : amount.toString().trim();
  if (!str) return 0;

  const isNegative = str.startsWith("-");
  const cleanStr = isNegative ? str.slice(1) : str;
  const [wholePart, fracPart = ""] = cleanStr.split(".");
  const whole = Number.parseInt(wholePart || "0", 10);
  const paddedFrac = (fracPart + "00").slice(0, 2);
  const frac = Number.parseInt(paddedFrac, 10);

  const cents = whole * 100 + frac;
  return isNegative ? -cents : cents;
}

/**
 * Formats integer cents into a fixed 2-decimal string (e.g. 600000 -> "6000.00").
 */
export function formatCents(cents: number): string {
  const isNegative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${isNegative ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Returns a Date set to 00:00:00.000 UTC for today.
 * Documented timezone boundary: UTC.
 */
export function getUtcMidnightToday(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
}

/**
 * Evaluates whether a date is strictly before today in UTC.
 * A date on today is NOT strictly before today.
 */
export function isDateStrictlyBeforeTodayUtc(
  dateInput: Date | string,
  now: Date = new Date(),
): boolean {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const targetMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const todayMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return targetMidnight < todayMidnight;
}

/**
 * Calculates total paid and outstanding balance using decimal-safe integer-cent arithmetic.
 * Shared across Student Detail page, Staff Dashboard, and payment processing.
 *
 * Rules:
 * - Total paid is the sum of all recorded payments.
 * - Outstanding balance = assignedFee - totalPaid (clamped to zero if fully paid).
 * - A student is overdue when: dueDate is strictly before today (UTC) AND outstandingBalance > 0.
 * - Fees due today or fully paid are not overdue.
 */
export function calculateFeeSummary(
  assignedFeeInput: string | number | { toString(): string },
  payments: Array<{ amount: string | number | { toString(): string } }>,
  dueDate?: Date | string | null,
  now: Date = new Date(),
): FeeSummary {
  const assignedFeeCents = parseCents(assignedFeeInput);

  let totalPaidCents = 0;
  for (const payment of payments) {
    totalPaidCents += parseCents(payment.amount);
  }

  const rawBalanceCents = assignedFeeCents - totalPaidCents;
  const balanceCents = rawBalanceCents > 0 ? rawBalanceCents : 0;
  const isPaidInFull = balanceCents === 0;

  let isOverdue = false;
  if (dueDate && balanceCents > 0) {
    isOverdue = isDateStrictlyBeforeTodayUtc(dueDate, now);
  }

  return {
    assignedFee: formatCents(assignedFeeCents),
    totalPaid: formatCents(totalPaidCents),
    outstandingBalance: formatCents(balanceCents),
    isPaidInFull,
    isOverdue,
    assignedFeeCents,
    totalPaidCents,
    balanceCents,
  };
}

/**
 * Formats a monetary amount in GBP (e.g. "£6,000.00" or "£70.00").
 */
export function formatGbp(amount: string | number | { toString(): string }): string {
  const cents = typeof amount === "number" && Number.isInteger(amount) ? amount : parseCents(amount);
  const num = cents / 100;
  return `£${num.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
