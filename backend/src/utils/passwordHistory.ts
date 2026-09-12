import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import prisma from "../config/database";

export const PASSWORD_REUSED_ERROR =
  "Please choose a different password. You have already used this password before.";

/**
 * Returns true if `plainPassword` matches the current hash or any stored history hash.
 */
export async function isPasswordPreviouslyUsed(
  userId: string,
  plainPassword: string,
  currentPasswordHash?: string | null,
): Promise<boolean> {
  const candidates: string[] = [];
  if (currentPasswordHash) {
    candidates.push(currentPasswordHash);
  }

  const history = await prisma.$queryRaw<Array<{ passwordHash: string }>>`
    SELECT "passwordHash"
    FROM "UserPasswordHistory"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
  `;
  for (const row of history) {
    if (row.passwordHash) candidates.push(row.passwordHash);
  }

  for (const hash of candidates) {
    const match = await bcrypt.compare(plainPassword, hash);
    if (match) return true;
  }
  return false;
}

/**
 * Archive the current password hash before replacing it.
 */
export async function archiveUserPassword(
  userId: string,
  passwordHash: string | null | undefined,
): Promise<void> {
  if (!passwordHash) return;
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "UserPasswordHistory" (id, "userId", "passwordHash", "createdAt")
    VALUES (${id}, ${userId}, ${passwordHash}, NOW())
  `;
}
