import "dotenv/config";
import { db } from "../src/lib/db";

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

  const students = await db.student.findMany({
    where: {
      id: { in: studentFixtures.map((student) => student.id) },
    },
    include: {
      programme: true,
      feeAssignment: true,
    },
    orderBy: { studentNumber: "asc" },
  });

  console.table(
    students.map((student) => ({
      studentId:
        `SMS-${student.enrolmentYear}-` +
        String(student.studentNumber).padStart(4, "0"),
      name: student.fullName,
      programme: student.programme.name,
      fee: student.feeAssignment?.amount.toFixed(2),
      dueDate: student.feeAssignment?.dueDate
        .toISOString()
        .slice(0, 10),
    })),
  );

  console.log("Core demo data seeded successfully.");
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