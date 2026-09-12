import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("store123", 10);
  await prisma.$executeRaw`
    UPDATE "User"
    SET password = ${hash}, "updatedAt" = NOW()
    WHERE email = 'store@ctc.com'
  `;
  // Clear history so test starts clean
  await prisma.$executeRaw`
    DELETE FROM "UserPasswordHistory"
    WHERE "userId" = (SELECT id FROM "User" WHERE email = 'store@ctc.com')
  `;
  console.log("store@ctc.com password reset to store123, history cleared");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
