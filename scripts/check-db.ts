import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const [programmeCount, studentCount] = await Promise.all([
    db.programme.count(),
    db.student.count(),
  ]);

  console.log("Database connection successful.");
  console.table({
    programmes: programmeCount,
    students: studentCount,
  });
}

main()
  .catch((error: unknown) => {
    console.error("Database check failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });