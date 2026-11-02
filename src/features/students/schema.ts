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
