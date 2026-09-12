import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = "http://localhost:5001/api";

async function login(email: string, password: string) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  const res = await fetch(`${base}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  let auth = await login("store@ctc.com", "store123");
  if (!auth.ok) {
    auth = await login("store@ctc.com", "store1234");
    if (!auth.ok) throw new Error(`login failed: ${JSON.stringify(auth.body)}`);
    console.log("logged in with store1234, normalizing to store123...");
    const reset = await changePassword(auth.body.token, "store1234", "store123");
    console.log("normalize", reset.status, reset.body);
    auth = await login("store@ctc.com", "store123");
  }
  if (!auth.ok) throw new Error(`login store123 failed: ${JSON.stringify(auth.body)}`);
  console.log("logged in with store123");

  let r = await changePassword(auth.body.token, "store123", "store1234");
  console.log("change to store1234:", r.status, r.body);

  auth = await login("store@ctc.com", "store1234");
  if (!auth.ok) throw new Error("login store1234 failed");

  r = await changePassword(auth.body.token, "store1234", "store123");
  console.log("reuse store123 (expect 400):", r.status, r.body);

  const hist = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c FROM "UserPasswordHistory"
  `;
  console.log("history rows:", hist[0]?.c);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
