import "server-only";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { demoIdentitySchema, type DemoIdentity } from "@/features/demo/schema";
import { demoStudentIds } from "@/features/demo/demo-students";

export const DEMO_COOKIE_NAME = "registry_demo_identity";

export const DEMO_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 8,
} as const;

export async function resolveDemoIdentity(
  input: unknown,
): Promise<DemoIdentity | null> {
  const parsed = demoIdentitySchema.safeParse(input);

  if (!parsed.success) {
    return null;
  }

  if (parsed.data.role === "STUDENT") {
    if (!demoStudentIds.includes(parsed.data.studentId)) {
      return null;
    }

    const student = await db.student.findUnique({
      where: { id: parsed.data.studentId },
      select: { id: true },
    });

    if (!student) {
      return null;
    }
  }

  return parsed.data;
}

export async function getDemoIdentity(): Promise<DemoIdentity | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DEMO_COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  let input: unknown;

  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }

  return resolveDemoIdentity(input);
}
