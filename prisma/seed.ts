import "dotenv/config";
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

  console.log("Core demo data, payments, and assessments seeded successfully.");
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
