import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { parseStudentId } from "./format";
import type { StudentFilters } from "./schema";

export async function getProgrammeFilterOptions() {
  return db.programme.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getStudentsDirectory(filters: StudentFilters) {
  const andConditions: Prisma.StudentWhereInput[] = [];

  if (filters.search) {
    const parsedId = parseStudentId(filters.search);
    if (parsedId) {
      andConditions.push({
        OR: [
          {
            enrolmentYear: parsedId.enrolmentYear,
            studentNumber: parsedId.studentNumber,
          },
          {
            fullName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        ],
      });
    } else {
      andConditions.push({
        fullName: {
          contains: filters.search,
          mode: "insensitive",
        },
      });
    }
  }

  if (filters.programme) {
    andConditions.push({
      programmeId: filters.programme,
    });
  }

  if (filters.status) {
    andConditions.push({
      status: filters.status,
    });
  }

  const where: Prisma.StudentWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  return db.student.findMany({
    where,
    select: {
      id: true,
      studentNumber: true,
      enrolmentYear: true,
      fullName: true,
      academicYear: true,
      status: true,
      programme: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      studentNumber: "asc",
    },
  });
}

export type DirectoryStudent = Awaited<
  ReturnType<typeof getStudentsDirectory>
>[number];
