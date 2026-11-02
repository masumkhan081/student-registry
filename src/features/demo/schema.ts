import { z } from "zod";

export const demoIdentitySchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("STAFF"),
  }),
  z.object({
    role: z.literal("STUDENT"),
    studentId: z.string().trim().min(1).max(100),
  }),
]);

export type DemoIdentity = z.infer<typeof demoIdentitySchema>;