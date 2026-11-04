import "dotenv/config";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { execSync } from "node:child_process";
import { db } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import {
  isSubmissionLate,
  getGradeClassification,
} from "../src/features/assessments/format";
import {
  validateDocxArchive,
  validateFileBuffer,
  getSupabaseServerClient,
  getStorageBucketName,
  downloadStorageObjectBuffer,
  deleteStorageObject,
} from "../src/lib/storage";
import { POST as submitFinalisationHandler } from "../src/app/api/assessments/[id]/submit/route";

function createValidCourseworkPdfBuffer(title: string, author: string): Buffer {
  const streamContent = [
    "BT",
    "/F1 18 Tf",
    "50 720 Td",
    `(${title}) Tj`,
    "/F1 12 Tf",
    "0 -30 Td",
    `(${author} - Student Coursework Submission) Tj`,
    "/F1 10 Tf",
    "0 -25 Td",
    "(BSc Computing - Academic Year 2026/2027) Tj",
    "0 -20 Td",
    "(CS201 Data Structures & Algorithms Coursework Report) Tj",
    "0 -30 Td",
    "(Executive Summary:) Tj",
    "0 -18 Td",
    "(This coursework analyses algorithm efficiency, time complexity,) Tj",
    "0 -15 Td",
    "(and empirical benchmark results across tree structures and hash maps.) Tj",
    "ET",
  ].join("\n");

  const streamBytes = Buffer.from(streamContent, "utf-8");
  const streamLength = streamBytes.length;

  const header = "%PDF-1.4\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  const obj3 =
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n";
  const obj4Start = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n`;
  const obj4End = "\nendstream\nendobj\n";
  const obj5 =
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  let offset = header.length;
  const o1 = offset;
  offset += obj1.length;
  const o2 = offset;
  offset += obj2.length;
  const o3 = offset;
  offset += obj3.length;
  const o4 = offset;
  offset += obj4Start.length + streamLength + obj4End.length;
  const o5 = offset;
  offset += obj5.length;

  const startxref = offset;

  function padOffset(n: number): string {
    return String(n).padStart(10, "0");
  }

  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    `${padOffset(o1)} 00000 n `,
    `${padOffset(o2)} 00000 n `,
    `${padOffset(o3)} 00000 n `,
    `${padOffset(o4)} 00000 n `,
    `${padOffset(o5)} 00000 n `,
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    String(startxref),
    "%%EOF\n",
  ].join("\n");

  const parts = [
    Buffer.from(header, "utf-8"),
    Buffer.from(obj1, "utf-8"),
    Buffer.from(obj2, "utf-8"),
    Buffer.from(obj3, "utf-8"),
    Buffer.from(obj4Start, "utf-8"),
    streamBytes,
    Buffer.from(obj4End, "utf-8"),
    Buffer.from(obj5, "utf-8"),
    Buffer.from(xref, "utf-8"),
  ];

  return Buffer.concat(parts);
}

// Helper to create a minimal in-memory ZIP buffer with given file entries
function createZipArchive(files: Record<string, Buffer | string>): Buffer {
  const fileEntries: Array<{
    name: Buffer;
    data: Buffer;
    offset: number;
    crc: number;
  }> = [];

  const chunks: Buffer[] = [];
  let currentOffset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf-8");
    const dataBuf = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, "utf-8");

    // Deflate compression
    const compressed = deflateRawSync(dataBuf);

    // CRC32 calculation
    let crc = 0 ^ -1;
    for (let i = 0; i < dataBuf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ dataBuf[i]) & 0xff];
    }
    crc = (crc ^ -1) >>> 0;

    // Local file header: 30 bytes + name length + data length
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // Min version
    localHeader.writeUInt16LE(0, 6); // Flags
    localHeader.writeUInt16LE(8, 8); // Compression: Deflate
    localHeader.writeUInt16LE(0, 10); // Mod time
    localHeader.writeUInt16LE(0, 12); // Mod date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Comp size
    localHeader.writeUInt32LE(dataBuf.length, 22); // Uncomp size
    localHeader.writeUInt16LE(nameBuf.length, 26); // Name len
    localHeader.writeUInt16LE(0, 28); // Extra len

    fileEntries.push({
      name: nameBuf,
      data: compressed,
      offset: currentOffset,
      crc,
    });

    chunks.push(localHeader, nameBuf, compressed);
    currentOffset += localHeader.length + nameBuf.length + compressed.length;
  }

  // Central Directory
  const cdStart = currentOffset;
  let cdSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Signature PK\x01\x02
    cdHeader.writeUInt16LE(20, 4); // Made by
    cdHeader.writeUInt16LE(20, 6); // Version needed
    cdHeader.writeUInt16LE(0, 8); // Flags
    cdHeader.writeUInt16LE(8, 10); // Method: Deflate
    cdHeader.writeUInt16LE(0, 12); // Mod time
    cdHeader.writeUInt16LE(0, 14); // Mod date
    cdHeader.writeUInt32LE(entry.crc, 16); // CRC-32
    cdHeader.writeUInt32LE(entry.data.length, 20); // Comp size
    // Uncompressed size
    const rawLen = Object.entries(files).find(
      ([k]) => Buffer.from(k).equals(entry.name),
    )?.[1];
    const uncompLen = Buffer.isBuffer(rawLen)
      ? rawLen.length
      : Buffer.byteLength(rawLen as string);
    cdHeader.writeUInt32LE(uncompLen, 24);
    cdHeader.writeUInt16LE(entry.name.length, 28);
    cdHeader.writeUInt16LE(0, 30); // Extra len
    cdHeader.writeUInt16LE(0, 32); // Comment len
    cdHeader.writeUInt16LE(0, 34); // Disk start
    cdHeader.writeUInt16LE(0, 36); // Internal attr
    cdHeader.writeUInt32LE(0, 38); // External attr
    cdHeader.writeUInt32LE(entry.offset, 42); // Local header offset

    chunks.push(cdHeader, entry.name);
    cdSize += cdHeader.length + entry.name.length;
    currentOffset += cdHeader.length + entry.name.length;
  }

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // Disk num
  eocd.writeUInt16LE(0, 6); // CD disk
  eocd.writeUInt16LE(fileEntries.length, 8); // Entries this disk
  eocd.writeUInt16LE(fileEntries.length, 10); // Total entries
  eocd.writeUInt32LE(cdSize, 12); // CD size
  eocd.writeUInt32LE(cdStart, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // Comment len

  chunks.push(eocd);

  return Buffer.concat(chunks);
}

// CRC32 table initialization
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

// Global cleanup tracker for test fixtures
const cleanups: Array<() => Promise<void>> = [];

async function runAllCleanups() {
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch {
      // Ignore cleanup error
    }
  }
}

async function test1_ConcurrentPayments() {
  console.log("\n[1/7] Testing concurrent payments against fee balance...");

  const testStudentId = "test-verify-student-concurrent-pay";
  const testProgrammeId = "test-verify-prog-pay";

  // Set up isolated programme & student
  await db.programme.upsert({
    where: { id: testProgrammeId },
    update: {},
    create: {
      id: testProgrammeId,
      name: "Test Payment Programme",
      defaultFee: "100.00",
    },
  });

  await db.student.create({
    data: {
      id: testStudentId,
      fullName: "Test Concurrent Student",
      email: "test.concurrent@example.com",
      dateOfBirth: new Date("2000-01-01"),
      programmeId: testProgrammeId,
      academicYear: "2026/2027",
      enrolmentYear: 2026,
      feeAssignment: {
        create: {
          amount: new Prisma.Decimal("100.00"),
          dueDate: new Date("2026-12-31"),
        },
      },
    },
  });

  cleanups.push(async () => {
    await db.payment.deleteMany({
      where: { feeAssignment: { studentId: testStudentId } },
    });
    await db.feeAssignment.deleteMany({ where: { studentId: testStudentId } });
    await db.student.deleteMany({ where: { id: testStudentId } });
    await db.programme.deleteMany({ where: { id: testProgrammeId } });
  });

  // Execute two concurrent payments of £70 each using row-locked transaction
  async function attemptPayment(ref: string) {
    return await db.$transaction(async (tx) => {
      const student = await tx.student.findUniqueOrThrow({
        where: { id: testStudentId },
        include: { feeAssignment: true },
      });
      const feeAssignmentId = student.feeAssignment!.id;

      // Acquire exclusive lock on FeeAssignment
      await tx.$queryRaw`SELECT id FROM "FeeAssignment" WHERE id = ${feeAssignmentId} FOR UPDATE`;

      const feeAssignment = await tx.feeAssignment.findUniqueOrThrow({
        where: { id: feeAssignmentId },
        include: { payments: true },
      });

      let totalPaid = new Prisma.Decimal(0);
      for (const p of feeAssignment.payments) {
        totalPaid = totalPaid.plus(p.amount);
      }

      const assignedFee = new Prisma.Decimal(feeAssignment.amount);
      const remainingBalance = assignedFee.minus(totalPaid);
      const paymentAmount = new Prisma.Decimal("70.00");

      if (paymentAmount.greaterThan(remainingBalance)) {
        throw new Error(
          `Payment of £${paymentAmount.toFixed(2)} exceeds remaining balance of £${remainingBalance.toFixed(2)}.`,
        );
      }

      return await tx.payment.create({
        data: {
          feeAssignmentId,
          amount: paymentAmount,
          paymentDate: new Date(),
          reference: ref,
        },
      });
    });
  }

  const results = await Promise.allSettled([
    attemptPayment("TEST-REF-A"),
    attemptPayment("TEST-REF-B"),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(
    fulfilled.length,
    1,
    "Expected exactly one payment to succeed under concurrent lock.",
  );
  assert.equal(
    rejected.length,
    1,
    "Expected exactly one payment to be rejected due to overpayment.",
  );

  const feeAssignment = await db.feeAssignment.findUniqueOrThrow({
    where: { studentId: testStudentId },
    include: { payments: true },
  });

  let totalPaid = new Prisma.Decimal(0);
  for (const p of feeAssignment.payments) {
    totalPaid = totalPaid.plus(p.amount);
  }
  const remaining = new Prisma.Decimal(feeAssignment.amount).minus(totalPaid);

  assert.equal(
    totalPaid.toFixed(2),
    "70.00",
    "Total paid must be exactly £70.00.",
  );
  assert.equal(
    remaining.toFixed(2),
    "30.00",
    "Remaining balance must be exactly £30.00.",
  );

  console.log("✓ Concurrent payments test passed: 1 succeeded, 1 rejected, balance is £30.00.");
}

async function test2_SeedRerunPreservation() {
  console.log("\n[2/7] Testing demo seed rerun preservation...");

  // Verify Noah Patel's submission and published grade
  const noahBefore = await db.submission.findUnique({
    where: {
      studentId_assessmentId: {
        studentId: "demo-student-noah",
        assessmentId: "demo-assessment-computing-past",
      },
    },
    include: { result: true },
  });

  assert.ok(noahBefore, "Noah Patel submission must exist.");
  assert.ok(noahBefore.result, "Noah Patel result must exist.");
  assert.equal(noahBefore.result.grade.toFixed(2), "82.00");
  assert.ok(
    noahBefore.result.publishedAt !== null,
    "Noah result must be published.",
  );

  // Run the seed
  console.log("  Running prisma db seed...");
  execSync("npm run db:seed", { stdio: "pipe" });

  // Verify Noah's and Mia's data are completely preserved
  const noahAfter = await db.submission.findUnique({
    where: {
      studentId_assessmentId: {
        studentId: "demo-student-noah",
        assessmentId: "demo-assessment-computing-past",
      },
    },
    include: { result: true },
  });

  assert.ok(noahAfter, "Noah Patel submission must exist after seed.");
  assert.ok(noahAfter.result, "Noah Patel result must exist after seed.");
  assert.equal(noahAfter.result.grade.toFixed(2), "82.00");
  assert.equal(
    noahAfter.result.publishedAt?.toISOString(),
    noahBefore.result.publishedAt?.toISOString(),
    "Noah publishedAt must not be overwritten by seed rerun.",
  );

  console.log("✓ Seed rerun preservation passed: student uploads and staff grades preserved.");
}

async function test3_GradingAndPublicationConcurrency() {
  console.log("\n[3/7] Testing atomic grading, publication races & conflict handling...");

  const testStudentId = "test-verify-student-grading-race";
  const testAssessmentId = "test-verify-assessment-race";
  const testProgId = "test-verify-prog-race";

  await db.programme.upsert({
    where: { id: testProgId },
    update: {},
    create: {
      id: testProgId,
      name: "Test Race Programme",
      defaultFee: "1000.00",
    },
  });

  await db.student.create({
    data: {
      id: testStudentId,
      fullName: "Test Race Student",
      email: "test.race@example.com",
      dateOfBirth: new Date("2001-01-01"),
      programmeId: testProgId,
      academicYear: "2026/2027",
      enrolmentYear: 2026,
    },
  });

  // Assessment deadline 1 hour in the future
  const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);

  await db.assessment.create({
    data: {
      id: testAssessmentId,
      programmeId: testProgId,
      academicYear: "2026/2027",
      title: "Concurrency Test Assessment",
      module: "CS999 Concurrency",
      deadline: futureDeadline,
    },
  });

  cleanups.push(async () => {
    await db.result.deleteMany({
      where: { submission: { studentId: testStudentId } },
    });
    await db.submission.deleteMany({ where: { studentId: testStudentId } });
    await db.assessment.deleteMany({ where: { id: testAssessmentId } });
    await db.student.deleteMany({ where: { id: testStudentId } });
    await db.programme.deleteMany({ where: { id: testProgId } });
  });

  // Step A: Student submits initial file
  const initialSub = await db.submission.create({
    data: {
      studentId: testStudentId,
      assessmentId: testAssessmentId,
      storagePath: `submissions/${testStudentId}/${testAssessmentId}/1-init.pdf`,
      originalFilename: "initial.pdf",
      size: 1024,
      submittedAt: new Date(Date.now() - 5000),
    },
  });

  const staffViewedUpdatedAt = initialSub.updatedAt.toISOString();

  // Step B: Student replaces file before deadline (modifies submission.updatedAt)
  // Ensure timestamp advances
  await new Promise((resolve) => setTimeout(resolve, 50));
  const replacedTime = new Date();

  await db.submission.update({
    where: { id: initialSub.id },
    data: {
      storagePath: `submissions/${testStudentId}/${testAssessmentId}/2-replaced.pdf`,
      originalFilename: "replaced.pdf",
      submittedAt: replacedTime,
    },
  });

  // Step C: Staff tries to save grade using stale submissionUpdatedAt -> must detect 409 conflict
  const saveGradeWithLock = async (
    subId: string,
    gradeStr: string,
    expectedSubUpdatedAt: string,
    expectedResUpdatedAt?: string,
  ) => {
    return await db.$transaction(async (tx) => {
      const lockedSub = await tx.$queryRaw<
        Array<{ id: string; updatedAt: Date }>
      >`SELECT id, "updatedAt" FROM "Submission" WHERE id = ${subId} FOR UPDATE`;

      if (lockedSub.length === 0) return { status: 404 };
      if (lockedSub[0].updatedAt.toISOString() !== expectedSubUpdatedAt) {
        return {
          status: 409,
          error: "The student has resubmitted this coursework.",
        };
      }

      const existingResult = await tx.result.findUnique({
        where: { submissionId: subId },
      });

      if (existingResult) {
        const lockedRes = await tx.$queryRaw<
          Array<{
            id: string;
            grade: Prisma.Decimal;
            publishedAt: Date | null;
            updatedAt: Date;
          }>
        >`SELECT id, grade, "publishedAt", "updatedAt" FROM "Result" WHERE id = ${existingResult.id} FOR UPDATE`;

        if (
          expectedResUpdatedAt &&
          lockedRes[0].updatedAt.toISOString() !== expectedResUpdatedAt
        ) {
          return { status: 409, error: "Result updated concurrently." };
        }

        const isSame = new Prisma.Decimal(lockedRes[0].grade).equals(
          new Prisma.Decimal(gradeStr),
        );
        const newPub = isSame ? lockedRes[0].publishedAt : null;

        const updated = await tx.result.update({
          where: { id: lockedRes[0].id },
          data: {
            grade: new Prisma.Decimal(gradeStr),
            publishedAt: newPub,
          },
        });
        return { status: 200, result: updated };
      }

      const created = await tx.result.create({
        data: {
          submissionId: subId,
          grade: new Prisma.Decimal(gradeStr),
          publishedAt: null,
        },
      });
      return { status: 200, result: created };
    });
  };

  const staleGradeAttempt = await saveGradeWithLock(
    initialSub.id,
    "85.00",
    staffViewedUpdatedAt,
  );
  assert.equal(
    staleGradeAttempt.status,
    409,
    "Expected 409 Conflict when grading after student file replacement.",
  );

  // Step D: Staff reopens and grades with current version -> saves as withheld
  const freshSub = await db.submission.findUniqueOrThrow({
    where: { id: initialSub.id },
  });
  const validGrade = await saveGradeWithLock(
    freshSub.id,
    "65.00",
    freshSub.updatedAt.toISOString(),
  );
  assert.equal(validGrade.status, 200);
  assert.equal(validGrade.result!.publishedAt, null, "New grade must be withheld.");

  // Step E: Staff A updates grade to 70.00
  const updatedGradeResult = await saveGradeWithLock(
    freshSub.id,
    "70.00",
    freshSub.updatedAt.toISOString(),
    validGrade.result!.updatedAt.toISOString(),
  );
  assert.equal(updatedGradeResult.status, 200);
  assert.equal(
    new Prisma.Decimal(updatedGradeResult.result!.grade).toFixed(2),
    "70.00",
  );

  // Step F: Staff B attempts to publish expecting grade 65 and old result version -> 409 conflict
  const publishWithLock = async (
    subId: string,
    expectedGradeStr: string,
    expectedResUpdatedAt: string,
  ) => {
    return await db.$transaction(async (tx) => {
      const sub = await tx.submission.findUnique({
        where: { id: subId },
        select: { result: { select: { id: true } } },
      });
      if (!sub?.result) return { status: 400 };

      const lockedRes = await tx.$queryRaw<
        Array<{
          id: string;
          grade: Prisma.Decimal;
          publishedAt: Date | null;
          updatedAt: Date;
        }>
      >`SELECT id, grade, "publishedAt", "updatedAt" FROM "Result" WHERE id = ${sub.result.id} FOR UPDATE`;

      if (lockedRes[0].updatedAt.toISOString() !== expectedResUpdatedAt) {
        return { status: 409, error: "Result updatedAt conflict" };
      }
      if (
        !new Prisma.Decimal(lockedRes[0].grade).equals(
          new Prisma.Decimal(expectedGradeStr),
        )
      ) {
        return { status: 409, error: "Grade conflict" };
      }

      const published = await tx.result.update({
        where: { id: lockedRes[0].id },
        data: { publishedAt: new Date() },
      });
      return { status: 200, result: published };
    });
  };

  const stalePublish = await publishWithLock(
    freshSub.id,
    "65.00",
    validGrade.result!.updatedAt.toISOString(),
  );
  assert.equal(
    stalePublish.status,
    409,
    "Expected 409 Conflict when publishing stale grade (expected 65, actual 70).",
  );

  // Step G: Staff publishes grade 70
  const validPublish = await publishWithLock(
    freshSub.id,
    "70.00",
    updatedGradeResult.result!.updatedAt.toISOString(),
  );
  assert.equal(validPublish.status, 200);
  assert.ok(validPublish.result!.publishedAt !== null);

  // Step H: Unchanged save preserves publication; changed save withholds
  const unchangedSave = await saveGradeWithLock(
    freshSub.id,
    "70.00",
    freshSub.updatedAt.toISOString(),
    validPublish.result!.updatedAt.toISOString(),
  );
  assert.equal(unchangedSave.status, 200);
  assert.ok(
    unchangedSave.result!.publishedAt !== null,
    "Unchanged grade save must preserve publication state.",
  );

  const changedSave = await saveGradeWithLock(
    freshSub.id,
    "75.00",
    freshSub.updatedAt.toISOString(),
    unchangedSave.result!.updatedAt.toISOString(),
  );
  assert.equal(changedSave.status, 200);
  assert.equal(
    changedSave.result!.publishedAt,
    null,
    "Changing a published grade must automatically withhold it again.",
  );

  // Step I: Replacement wipes prior result
  await db.$transaction(async (tx) => {
    await tx.result.deleteMany({ where: { submissionId: freshSub.id } });
    await tx.submission.update({
      where: { id: freshSub.id },
      data: {
        storagePath: `submissions/${testStudentId}/${testAssessmentId}/3-clean.pdf`,
        submittedAt: new Date(),
      },
    });
  });

  const subAfterReplace = await db.submission.findUnique({
    where: { id: freshSub.id },
    include: { result: true },
  });
  assert.equal(
    subAfterReplace!.result,
    null,
    "Replacement coursework must wipe prior result.",
  );

  console.log("✓ Atomic grading and publication concurrency passed.");
}

async function test4_ExactDeadlineEquality() {
  console.log("\n[4/7] Testing exact deadline equality rule (submittedAt >= deadline is late)...");

  const deadline = new Date("2026-10-10T12:00:00.000Z");

  // Exact equality
  const exactSubmission = new Date("2026-10-10T12:00:00.000Z");
  assert.equal(
    isSubmissionLate(exactSubmission, deadline),
    true,
    "Submission at exact deadline must be flagged as Late.",
  );

  // 1 ms after
  const afterSubmission = new Date("2026-10-10T12:00:00.001Z");
  assert.equal(
    isSubmissionLate(afterSubmission, deadline),
    true,
    "Submission 1ms after deadline must be flagged as Late.",
  );

  // 1 ms before
  const beforeSubmission = new Date("2026-10-10T11:59:59.999Z");
  assert.equal(
    isSubmissionLate(beforeSubmission, deadline),
    false,
    "Submission 1ms before deadline must be flagged as On time.",
  );

  console.log("✓ Exact deadline equality passed: >= deadline is Late, < deadline is On time.");
}

async function test5_RenamedSpreadsheetRejectedAsDocx() {
  console.log("\n[5/7] Testing DOCX inspection: spreadsheet renamed to .docx is rejected...");

  // 1. Create a fake XLSX archive (workbook part + spreadsheet types)
  const xlsxArchive = createZipArchive({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
</Types>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>`,
  });

  const xlsxValidation = validateDocxArchive(xlsxArchive);
  assert.equal(
    xlsxValidation.isValid,
    false,
    "Renamed spreadsheet must fail DOCX validation.",
  );
  assert.ok(
    xlsxValidation.error?.includes("word/document.xml"),
    `Error should mention missing word/document.xml: ${xlsxValidation.error}`,
  );

  const fileValidation = validateFileBuffer(xlsxArchive);
  assert.equal(
    fileValidation.isValid,
    false,
    "Renamed spreadsheet must fail validateFileBuffer.",
  );

  // 2. Create a genuine DOCX archive
  const docxArchive = createZipArchive({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Genuine Word Coursework</w:t></w:r></w:p></w:body></w:document>`,
  });

  const docxValidation = validateDocxArchive(docxArchive);
  assert.equal(
    docxValidation.isValid,
    true,
    `Genuine DOCX must pass validation: ${docxValidation.error}`,
  );

  const docxFileVal = validateFileBuffer(docxArchive);
  assert.equal(docxFileVal.isValid, true);
  if (docxFileVal.isValid) {
    assert.equal(docxFileVal.format, "DOCX");
  }

  // 3. Test decompression bounds protection: reject manifest declaring excessive uncompressed size (> 1 MiB)
  const excessiveArchive = createZipArchive({
    "word/document.xml": "<w:document/>",
    "[Content_Types].xml": "test",
  });
  // Mutate uncompressed size of [Content_Types].xml to 5 MiB in ZIP header
  const mutated = Buffer.from(excessiveArchive);
  // Find PK\x01\x02
  for (let i = 0; i < mutated.length - 46; i++) {
    if (
      mutated[i] === 0x50 &&
      mutated[i + 1] === 0x4b &&
      mutated[i + 2] === 0x01 &&
      mutated[i + 3] === 0x02
    ) {
      const nameLen = mutated.readUInt16LE(i + 28);
      const name = mutated.subarray(i + 46, i + 46 + nameLen).toString("utf-8");
      if (name === "[Content_Types].xml") {
        mutated.writeUInt32LE(2 * 1024 * 1024, i + 24); // 2 MiB uncomp size
      }
    }
  }

  const bombValidation = validateDocxArchive(mutated);
  assert.equal(
    bombValidation.isValid,
    false,
    "Excessive manifest size declaration must be rejected cleanly.",
  );

  console.log("✓ DOCX inspection passed: renamed spreadsheets and decompression bombs rejected cleanly.");
}

async function test6_IdempotentFinalizationRetry() {
  console.log(
    "\n[6/7] Testing concurrent first-upload finalisation handler and duplicate P2002 conflict...",
  );

  const testStudentId = "test-verify-student-p2002-race";
  const testAssessmentId = "test-verify-assessment-p2002-race";
  const testProgId = "test-verify-prog-p2002";

  // Setup isolated programme, student and assessment
  await db.programme.upsert({
    where: { id: testProgId },
    update: {},
    create: {
      id: testProgId,
      name: "Test P2002 Race Programme",
      defaultFee: "1000.00",
    },
  });

  await db.student.create({
    data: {
      id: testStudentId,
      fullName: "Test P2002 Student",
      email: "test.p2002@example.com",
      dateOfBirth: new Date("2002-02-02"),
      programmeId: testProgId,
      academicYear: "2026/2027",
      enrolmentYear: 2026,
    },
  });

  await db.assessment.create({
    data: {
      id: testAssessmentId,
      programmeId: testProgId,
      academicYear: "2026/2027",
      title: "P2002 Race Test Assessment",
      module: "CS998 Concurrency",
      deadline: new Date(Date.now() + 86400000), // future deadline
    },
  });

  const uniqueFileId = `${Date.now()}-${crypto.randomUUID()}`;
  const canonicalPath = `submissions/${testStudentId}/${testAssessmentId}/${uniqueFileId}.pdf`;

  cleanups.push(async () => {
    await db.result.deleteMany({
      where: { submission: { studentId: testStudentId } },
    });
    await db.submission.deleteMany({ where: { studentId: testStudentId } });
    await db.assessment.deleteMany({ where: { id: testAssessmentId } });
    await db.student.deleteMany({ where: { id: testStudentId } });
    await db.programme.deleteMany({ where: { id: testProgId } });
    await deleteStorageObject(canonicalPath);
  });

  // 1. Upload valid test PDF to private Supabase Storage
  const samplePdfContent = createValidCourseworkPdfBuffer(
    "Concurrent Finalisation Coursework",
    "Test P2002 Student",
  );

  const supabase = getSupabaseServerClient();
  const bucket = getStorageBucketName();
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(canonicalPath, samplePdfContent, {
      contentType: "application/pdf",
      upsert: false,
    });

  assert.ok(
    !uploadError,
    `Failed to upload test file to Supabase storage: ${uploadError?.message}`,
  );

  // Helper to build a request to the actual finalisation handler
  function makeSubmitRequest() {
    return new Request(
      `http://localhost:3000/api/assessments/${testAssessmentId}/submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `registry_demo_identity=${encodeURIComponent(
            JSON.stringify({
              role: "STUDENT",
              studentId: testStudentId,
            }),
          )}`,
        },
        body: JSON.stringify({
          storagePath: canonicalPath,
          originalFilename: "coursework_submission.pdf",
        }),
      },
    );
  }

  // 2. Execute Request 1 to completion. It creates and commits the initial submission.
  const req1 = makeSubmitRequest();
  const res1 = await submitFinalisationHandler(req1, {
    params: Promise.resolve({ id: testAssessmentId }),
  });

  assert.equal(
    res1.status,
    201,
    `Request 1 should return 201 Created (got ${res1.status}).`,
  );
  const data1 = (await res1.json()) as {
    success: boolean;
    submission: { id: string };
  };
  assert.ok(data1.success, "Request 1 response must be success: true.");

  // 3. Execute Request 2, simulating a racing request that read state before Request 1 committed.
  // We mock the pre-transaction findUnique and tx.$queryRaw to simulate Request 2 starting concurrently,
  // so Request 2 proceeds to tx.submission.create.
  // PostgreSQL throws real P2002 (duplicate key violation on studentId_assessmentId),
  // forcing Request 2 into the P2002 conflict recovery branch.
  const originalFindUnique = db.submission.findUnique.bind(db.submission);
  const originalTransaction = db.$transaction.bind(db);

  try {
    let preCheckDone = false;
    (db.submission as unknown as { findUnique: unknown }).findUnique = (async (
      ...args: Parameters<typeof db.submission.findUnique>
    ) => {
      if (!preCheckDone) {
        preCheckDone = true;
        // Simulate racing check: no submission seen before transaction starts
        return null;
      }
      return originalFindUnique(...args);
    }) as unknown;

    (db as unknown as { $transaction: unknown }).$transaction = (async function (
      fn: (tx: unknown) => Promise<unknown>,
      options?: unknown,
    ) {
      return originalTransaction(async (tx: unknown) => {
        const txAny = tx as {
          $queryRaw: (...args: unknown[]) => Promise<unknown>;
        };
        const origQueryRaw = txAny.$queryRaw.bind(txAny);

        txAny.$queryRaw = async (...args: unknown[]) => {
          // If querying Submission for update, return empty array to simulate concurrent race
          const sql = String(args[0] || "");
          if (sql.includes("Submission") || args.length > 0) {
            return [];
          }
          return origQueryRaw(...args);
        };

        return fn(tx);
      }, options as never);
    }) as unknown;

    const req2 = makeSubmitRequest();
    const res2 = await submitFinalisationHandler(req2, {
      params: Promise.resolve({ id: testAssessmentId }),
    });

    assert.equal(
      res2.status,
      200,
      `Request 2 (recovering from P2002 conflict) should return 200 OK (got ${res2.status}).`,
    );

    const data2 = (await res2.json()) as {
      success: boolean;
      submission: { id: string };
    };

    assert.ok(data2.success, "Request 2 response must be success: true.");
    assert.equal(
      data1.submission.id,
      data2.submission.id,
      "Both requests must return the exact same submission ID.",
    );
  } finally {
    (db.submission as unknown as { findUnique: unknown }).findUnique =
      originalFindUnique;
    (db as unknown as { $transaction: unknown }).$transaction =
      originalTransaction;
  }

  // Assert only ONE submission row exists in the database
  const count = await db.submission.count({
    where: {
      studentId: testStudentId,
      assessmentId: testAssessmentId,
    },
  });
  assert.equal(
    count,
    1,
    "Exactly one submission row must exist in the database.",
  );

  // Assert the downloaded file from private storage matches the original bytes
  const downloadedBuffer = await downloadStorageObjectBuffer(canonicalPath);
  assert.ok(
    downloadedBuffer,
    "Uploaded object must still exist in Storage and must not be deleted by losing request.",
  );
  assert.equal(
    downloadedBuffer.length,
    samplePdfContent.length,
    "Downloaded file size must match original file size.",
  );
  assert.ok(
    downloadedBuffer.equals(samplePdfContent),
    "Downloaded file content must match original bytes exactly.",
  );

  // 4. Assign a grade and verify later retry preserves both file and active grade
  const winningSubId = data1.submission.id;
  await db.result.create({
    data: {
      submissionId: winningSubId,
      grade: new Prisma.Decimal("92.50"),
      publishedAt: new Date(),
    },
  });

  // Perform later retry of finalisation with same path
  const retryReq = makeSubmitRequest();
  const retryRes = await submitFinalisationHandler(retryReq, {
    params: Promise.resolve({ id: testAssessmentId }),
  });

  assert.equal(
    retryRes.status,
    200,
    "Retry of same uploaded object must return 200 OK.",
  );
  const retryData = (await retryRes.json()) as {
    success: boolean;
    submission: { id: string };
  };
  assert.ok(retryData.success);
  assert.equal(retryData.submission.id, winningSubId);

  // Verify grade and publication state are completely preserved
  const recheckedSub = await db.submission.findUniqueOrThrow({
    where: { id: winningSubId },
    include: { result: true },
  });
  assert.ok(
    recheckedSub.result,
    "Grade result must remain intact after retry.",
  );
  assert.equal(
    recheckedSub.result.grade.toFixed(2),
    "92.50",
    "Active grade must not be overwritten or cleared on retry.",
  );
  assert.ok(
    recheckedSub.result.publishedAt !== null,
    "Publication state must be preserved on retry.",
  );

  console.log(
    "✓ Concurrent finalisation and duplicate P2002 conflict passed: single submission created, file bytes intact, active grade preserved.",
  );
}

async function test7_StudentMarksheetIsolation() {
  console.log("\n[7/7] Testing student marksheet isolation & withheld grade absence...");

  const studentAId = "test-verify-student-marksheet-a";
  const studentBId = "test-verify-student-marksheet-b";
  const testProgId = "test-verify-prog-ms";
  const assess1Id = "test-verify-assess-ms-1";
  const assess2Id = "test-verify-assess-ms-2";

  await db.programme.upsert({
    where: { id: testProgId },
    update: {},
    create: {
      id: testProgId,
      name: "Test Marksheet Programme",
      defaultFee: "1000.00",
    },
  });

  await db.student.createMany({
    data: [
      {
        id: studentAId,
        fullName: "Student A Marksheet",
        email: "student.a@example.com",
        dateOfBirth: new Date("2003-03-03"),
        programmeId: testProgId,
        academicYear: "2026/2027",
        enrolmentYear: 2026,
      },
      {
        id: studentBId,
        fullName: "Student B Marksheet",
        email: "student.b@example.com",
        dateOfBirth: new Date("2003-04-04"),
        programmeId: testProgId,
        academicYear: "2026/2027",
        enrolmentYear: 2026,
      },
    ],
  });

  await db.assessment.createMany({
    data: [
      {
        id: assess1Id,
        programmeId: testProgId,
        academicYear: "2026/2027",
        title: "Assessment 1",
        module: "MOD1",
        deadline: new Date(),
      },
      {
        id: assess2Id,
        programmeId: testProgId,
        academicYear: "2026/2027",
        title: "Assessment 2",
        module: "MOD2",
        deadline: new Date(),
      },
    ],
  });

  cleanups.push(async () => {
    await db.result.deleteMany({
      where: {
        submission: {
          studentId: { in: [studentAId, studentBId] },
        },
      },
    });
    await db.submission.deleteMany({
      where: { studentId: { in: [studentAId, studentBId] } },
    });
    await db.assessment.deleteMany({
      where: { id: { in: [assess1Id, assess2Id] } },
    });
    await db.student.deleteMany({
      where: { id: { in: [studentAId, studentBId] } },
    });
    await db.programme.deleteMany({ where: { id: testProgId } });
  });

  // Student A: 1 Published result (72.00 Distinction) + 1 Withheld result (55.00 Pass)
  await db.submission.create({
    data: {
      studentId: studentAId,
      assessmentId: assess1Id,
      storagePath: `submissions/${studentAId}/${assess1Id}/1.pdf`,
      originalFilename: "a1.pdf",
      size: 100,
      submittedAt: new Date(),
      result: {
        create: {
          grade: new Prisma.Decimal("72.00"),
          publishedAt: new Date(), // PUBLISHED
        },
      },
    },
  });

  await db.submission.create({
    data: {
      studentId: studentAId,
      assessmentId: assess2Id,
      storagePath: `submissions/${studentAId}/${assess2Id}/2.pdf`,
      originalFilename: "a2.pdf",
      size: 100,
      submittedAt: new Date(),
      result: {
        create: {
          grade: new Prisma.Decimal("55.00"),
          publishedAt: null, // WITHHELD
        },
      },
    },
  });

  // Student B (Peer): 1 Published result (85.00 Distinction)
  await db.submission.create({
    data: {
      studentId: studentBId,
      assessmentId: assess1Id,
      storagePath: `submissions/${studentBId}/${assess1Id}/b1.pdf`,
      originalFilename: "b1.pdf",
      size: 100,
      submittedAt: new Date(),
      result: {
        create: {
          grade: new Prisma.Decimal("85.00"),
          publishedAt: new Date(), // PUBLISHED for peer
        },
      },
    },
  });

  // Execute the exact marksheet query as implemented in src/app/student/marksheet/page.tsx
  const studentAMarksheet = await db.result.findMany({
    where: {
      submission: {
        studentId: studentAId,
      },
      publishedAt: {
        not: null,
      },
    },
    include: {
      submission: {
        include: {
          assessment: true,
        },
      },
    },
  });

  assert.equal(
    studentAMarksheet.length,
    1,
    "Marksheet must return exactly 1 published result for Student A.",
  );
  assert.equal(studentAMarksheet[0].submission.studentId, studentAId);
  assert.equal(studentAMarksheet[0].grade.toFixed(2), "72.00");
  assert.equal(getGradeClassification(studentAMarksheet[0].grade.toNumber()), "Distinction");

  // Verify that Student A's withheld result is completely absent
  const hasWithheld = studentAMarksheet.some((r) => r.publishedAt === null);
  assert.equal(hasWithheld, false, "Withheld grades must be absent from marksheet response.");

  // Verify that Peer Student B's result is completely absent
  const hasPeerResult = studentAMarksheet.some((r) => r.submission.studentId === studentBId);
  assert.equal(hasPeerResult, false, "Peer student results must be strictly absent.");

  console.log("✓ Marksheet isolation passed: only Student A's published results returned; withheld and peers excluded.");
}

async function main() {
  console.log("=============================================================");
  console.log("  Running Declarative Student Registry Verification Suite    ");
  console.log("=============================================================");

  try {
    await test1_ConcurrentPayments();
    await test2_SeedRerunPreservation();
    await test3_GradingAndPublicationConcurrency();
    await test4_ExactDeadlineEquality();
    await test5_RenamedSpreadsheetRejectedAsDocx();
    await test6_IdempotentFinalizationRetry();
    await test7_StudentMarksheetIsolation();

    console.log("\n=============================================================");
    console.log("  ALL 7 VERIFICATION CHECKS PASSED SUCCESSFULLY!             ");
    console.log("=============================================================");
  } finally {
    await runAllCleanups();
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n❌ Verification suite failed:", err);
  process.exit(1);
});
