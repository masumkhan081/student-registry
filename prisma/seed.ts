import "dotenv/config";
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { db } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";

const programmeFixtures = [
  {
    id: "demo-programme-computing",
    name: "BSc Computing",
    defaultFee: "6000.00",
  },
  {
    id: "demo-programme-business",
    name: "BA Business Management",
    defaultFee: "5500.00",
  },
];

const studentFixtures = [
  {
    id: "demo-student-ava",
    fullName: "Ava Morgan",
    email: "ava.morgan@example.com",
    dateOfBirth: "2003-04-12",
    programmeId: "demo-programme-computing",
    dueInDays: -14,
  },
  {
    id: "demo-student-noah",
    fullName: "Noah Patel",
    email: "noah.patel@example.com",
    dateOfBirth: "2002-09-23",
    programmeId: "demo-programme-computing",
    dueInDays: 30,
  },
  {
    id: "demo-student-mia",
    fullName: "Mia Clarke",
    email: "mia.clarke@example.com",
    dateOfBirth: "2004-01-08",
    programmeId: "demo-programme-computing",
    dueInDays: 30,
  },
  {
    id: "demo-student-ethan",
    fullName: "Ethan Ahmed",
    email: "ethan.ahmed@example.com",
    dateOfBirth: "2003-06-17",
    programmeId: "demo-programme-business",
    dueInDays: -7,
  },
  {
    id: "demo-student-isla",
    fullName: "Isla Bennett",
    email: "isla.bennett@example.com",
    dateOfBirth: "2002-11-05",
    programmeId: "demo-programme-business",
    dueInDays: 30,
  },
];

function dateFromToday(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function dateTimeFromTodayUtc(days: number, hours: number, minutes: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
}

const seedPaymentFixtures = [
  {
    studentId: "demo-student-ava", // Partial payment example: £2,000 paid towards £6,000 fee
    amount: "2000.00",
    daysAgo: 5,
    reference: "SEED-PAY-AVA-001",
  },
  {
    studentId: "demo-student-mia", // Fully paid example: £6,000 paid towards £6,000 fee
    amount: "6000.00",
    daysAgo: 10,
    reference: "SEED-PAY-MIA-001",
  },
];

const assessmentFixtures = [
  {
    id: "demo-assessment-computing-upcoming",
    programmeId: "demo-programme-computing",
    academicYear: "2026/2027",
    title: "Web Applications Project",
    module: "CS204 Next.js Full Stack Architecture",
    getDeadline: () => dateTimeFromTodayUtc(14, 23, 59),
  },
  {
    id: "demo-assessment-computing-past",
    programmeId: "demo-programme-computing",
    academicYear: "2026/2027",
    title: "Algorithms & Data Structures Coursework",
    module: "CS201 Data Structures & Algorithms",
    getDeadline: () => dateTimeFromTodayUtc(-7, 23, 59),
  },
  {
    id: "demo-assessment-business-upcoming",
    programmeId: "demo-programme-business",
    academicYear: "2026/2027",
    title: "Strategic Management Case Study",
    module: "BM202 Strategic Leadership",
    getDeadline: () => dateTimeFromTodayUtc(21, 18, 0),
  },
];

function createSeedPdfBuffer(title: string, author: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 70 >>\nstream\nBT\n/F1 12 Tf\n72 712 Td\n(${title} - Coursework by ${author}) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000173 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n293\n%%EOF\n`,
  );
}

const seedSubmissionFixtures = [
  {
    studentId: "demo-student-noah", // Noah Patel: Published result (Distinction)
    assessmentId: "demo-assessment-computing-past",
    filename: "noah_patel_algorithms_coursework.pdf",
    submittedDaysAgo: 8,
    storagePath: "submissions/demo-student-noah/demo-assessment-computing-past/seed-noah-algorithms.pdf",
    grade: "82.00",
    publishedDaysAgo: 3, // Published 3 days ago
  },
  {
    studentId: "demo-student-mia", // Mia Clarke: Withheld result (Merit)
    assessmentId: "demo-assessment-computing-past",
    filename: "mia_clarke_algorithms_coursework.pdf",
    submittedDaysAgo: 6,
    storagePath: "submissions/demo-student-mia/demo-assessment-computing-past/seed-mia-algorithms.pdf",
    grade: "65.50",
    publishedDaysAgo: null, // Withheld
  },
];

async function main() {
  for (const programme of programmeFixtures) {
    await db.programme.upsert({
      where: { id: programme.id },
      update: {},
      create: programme,
    });
  }

  for (const fixture of studentFixtures) {
    const programme = await db.programme.findUniqueOrThrow({
      where: { id: fixture.programmeId },
    });

    await db.student.upsert({
      where: { id: fixture.id },
      update: {},
      create: {
        id: fixture.id,
        fullName: fixture.fullName,
        email: fixture.email,
        dateOfBirth: new Date(`${fixture.dateOfBirth}T00:00:00.000Z`),
        programmeId: programme.id,
        academicYear: "2026/2027",
        enrolmentYear: 2026,
        feeAssignment: {
          create: {
            amount: programme.defaultFee,
            dueDate: dateFromToday(fixture.dueInDays),
          },
        },
      },
    });
  }

  // Seed payments with idempotency, preserving reviewer payments and preventing overpayment
  for (const paymentFixture of seedPaymentFixtures) {
    const feeAssignment = await db.feeAssignment.findUnique({
      where: { studentId: paymentFixture.studentId },
      include: { payments: true },
    });

    if (!feeAssignment) continue;

    // Check if stable reference already exists
    const existingRef = feeAssignment.payments.find(
      (p) => p.reference.toLowerCase() === paymentFixture.reference.toLowerCase(),
    );

    if (existingRef) {
      continue; // Stable payment already recorded; preserve it
    }

    // Calculate current total paid from all existing payments (including reviewer payments)
    let totalPaid = new Prisma.Decimal(0);
    for (const p of feeAssignment.payments) {
      totalPaid = totalPaid.plus(p.amount);
    }

    const assignedFee = new Prisma.Decimal(feeAssignment.amount);
    const remainingBalance = assignedFee.minus(totalPaid);
    const intendedAmount = new Prisma.Decimal(paymentFixture.amount);

    // Ensure rerunning the seed cannot create an overpayment
    if (remainingBalance.greaterThan(0)) {
      const amountToRecord = Prisma.Decimal.min(intendedAmount, remainingBalance);
      if (amountToRecord.greaterThan(0)) {
        await db.payment.create({
          data: {
            feeAssignmentId: feeAssignment.id,
            amount: amountToRecord,
            paymentDate: dateFromToday(-paymentFixture.daysAgo),
            reference: paymentFixture.reference,
          },
        });
      }
    }
  }

  // Seed repeatable assessments: preserve existing deadlines and reviewer-created records
  for (const fixture of assessmentFixtures) {
    const existing = await db.assessment.findUnique({
      where: { id: fixture.id },
    });

    if (!existing) {
      await db.assessment.create({
        data: {
          id: fixture.id,
          programmeId: fixture.programmeId,
          academicYear: fixture.academicYear,
          title: fixture.title,
          module: fixture.module,
          deadline: fixture.getDeadline(),
        },
      });
    }
    // If it exists, do not overwrite deadline to preserve reviewer modifications
  }

  // Seed submissions & results with real downloadable files in Supabase Storage
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "sms";

  let supabaseClient = null;
  if (supabaseUrl && supabaseKey) {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  for (const fixture of seedSubmissionFixtures) {
    const existingSub = await db.submission.findUnique({
      where: {
        studentId_assessmentId: {
          studentId: fixture.studentId,
          assessmentId: fixture.assessmentId,
        },
      },
      include: { result: true },
    });

    const pdfBuffer = createSeedPdfBuffer(
      "Algorithms Coursework",
      fixture.studentId === "demo-student-noah" ? "Noah Patel" : "Mia Clarke",
    );

    // If storage client is configured, ensure demo file is in Supabase Storage
    if (supabaseClient) {
      try {
        await supabaseClient.storage
          .from(bucket)
          .upload(fixture.storagePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: true,
          });
      } catch (err: unknown) {
        console.warn(
          `Could not upload seed file to storage: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!existingSub) {
      // Create new submission with its result
      const submittedAt = dateFromToday(-fixture.submittedDaysAgo);
      const publishedAt =
        fixture.publishedDaysAgo !== null
          ? dateFromToday(-fixture.publishedDaysAgo)
          : null;

      await db.submission.create({
        data: {
          studentId: fixture.studentId,
          assessmentId: fixture.assessmentId,
          storagePath: fixture.storagePath,
          originalFilename: fixture.filename,
          size: pdfBuffer.length,
          submittedAt,
          result: {
            create: {
              grade: new Prisma.Decimal(fixture.grade),
              publishedAt,
            },
          },
        },
      });
    } else {
      // Submission already exists: preserve reviewer edits on rerun
      // Only seed Result if no result exists yet
      if (!existingSub.result) {
        const publishedAt =
          fixture.publishedDaysAgo !== null
            ? dateFromToday(-fixture.publishedDaysAgo)
            : null;

        await db.result.create({
          data: {
            submissionId: existingSub.id,
            grade: new Prisma.Decimal(fixture.grade),
            publishedAt,
          },
        });
      }
    }
  }

  // Guarantee Ava's upcoming assessment has NO submission, so the reviewer can walk through upload -> grade -> publish
  await db.submission.deleteMany({
    where: {
      studentId: "demo-student-ava",
      assessmentId: "demo-assessment-computing-upcoming",
    },
  });

  const students = await db.student.findMany({
    where: {
      id: { in: studentFixtures.map((student) => student.id) },
    },
    include: {
      programme: true,
      feeAssignment: {
        include: {
          payments: {
            orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
          },
        },
      },
    },
    orderBy: { studentNumber: "asc" },
  });

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  console.log("\n--- Student Cohort & Fees ---");
  console.table(
    students.map((student) => {
      const fee = student.feeAssignment?.amount ?? new Prisma.Decimal(0);
      let paid = new Prisma.Decimal(0);
      for (const p of student.feeAssignment?.payments ?? []) {
        paid = paid.plus(p.amount);
      }
      const balance = Prisma.Decimal.max(new Prisma.Decimal(0), fee.minus(paid));
      const dueDate = student.feeAssignment?.dueDate;
      const dueMidnight = dueDate
        ? Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())
        : 0;
      const isOverdue = dueDate && dueMidnight < todayUtc && balance.greaterThan(0);

      return {
        studentId:
          `SMS-${student.enrolmentYear}-` +
          String(student.studentNumber).padStart(4, "0"),
        name: student.fullName,
        programme: student.programme.name,
        fee: `£${fee.toFixed(2)}`,
        paid: `£${paid.toFixed(2)}`,
        balance: `£${balance.toFixed(2)}`,
        dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : "N/A",
        status: balance.equals(0)
          ? "Paid in full"
          : isOverdue
            ? "OVERDUE"
            : "Outstanding",
      };
    }),
  );

  const seededAssessments = await db.assessment.findMany({
    include: { programme: true },
    orderBy: [{ deadline: "asc" }, { title: "asc" }],
  });

  console.log("\n--- Repeatable Assessment Fixtures ---");
  console.table(
    seededAssessments.map((a) => {
      const isPast = a.deadline.getTime() < now.getTime();
      return {
        id: a.id,
        title: a.title,
        module: a.module,
        programme: a.programme.name,
        cohortYear: a.academicYear,
        deadlineUtc: a.deadline.toISOString().replace(".000Z", " UTC"),
        status: isPast ? "Past deadline" : "Upcoming",
      };
    }),
  );

  const seededSubmissions = await db.submission.findMany({
    include: {
      student: true,
      assessment: true,
      result: true,
    },
    orderBy: [{ submittedAt: "desc" }],
  });

  console.log("\n--- Submissions & Results Fixtures ---");
  console.table(
    seededSubmissions.map((s) => ({
      student: s.student.fullName,
      assessment: s.assessment.title,
      file: s.originalFilename,
      grade: s.result ? `${s.result.grade.toFixed(2)}%` : "Ungraded",
      publication: s.result
        ? s.result.publishedAt
          ? "PUBLISHED"
          : "WITHHELD"
        : "N/A",
    })),
  );

  console.log("Core demo data, payments, assessments, and submission results seeded successfully.");
}

main()
  .catch((error: unknown) => {
    console.error("Seeding failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
