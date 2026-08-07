import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getPresetPermissions } from "../permissions/catalog";

const prisma = new PrismaClient();

const ROLE_DEFS = [
  {
    name: "Manager",
    description: "Operations and inventory oversight",
  },
  {
    name: "Accountant",
    description: "Accounting and financial reports",
  },
  {
    name: "Sales",
    description: "Sales and customer operations",
  },
  {
    name: "Store User",
    description: "Store operations access",
  },
] as const;

const USER_DEFS = [
  {
    name: "Manager User",
    email: "manager@ctc.com",
    password: "manager123",
    roleName: "Manager",
  },
  {
    name: "Accountant User",
    email: "accountant@ctc.com",
    password: "accountant123",
    roleName: "Accountant",
  },
  {
    name: "Sales User",
    email: "sales@ctc.com",
    password: "sales123",
    roleName: "Sales",
  },
] as const;

async function ensureRole(def: (typeof ROLE_DEFS)[number]) {
  const permissions = getPresetPermissions(def.name);
  const existing = await prisma.role.findFirst({
    where: { name: def.name },
  });

  if (existing) {
    await prisma.role.update({
      where: { id: existing.id },
      data: {
        description: def.description,
        permissions: JSON.stringify(permissions),
      },
    });
    console.log(`Updated role: ${def.name} (${permissions.length} permissions)`);
    return existing;
  }

  const role = await prisma.role.create({
    data: {
      id: randomUUID(),
      name: def.name,
      type: def.name === "Store User" ? "System" : "Custom",
      description: def.description,
      permissions: JSON.stringify(permissions),
      usersCount: 0,
      updatedAt: new Date(),
    },
  });
  console.log(`Created role: ${def.name}`);
  return role;
}

async function ensureUser(def: (typeof USER_DEFS)[number], roleId: string) {
  const existing = await prisma.user.findUnique({
    where: { email: def.email },
  });
  if (existing) {
    console.log(`User already exists: ${def.email}`);
    return;
  }
  const hashedPassword = await bcrypt.hash(def.password, 10);
  await prisma.user.create({
    data: {
      id: randomUUID(),
      name: def.name,
      email: def.email,
      password: hashedPassword,
      roleId,
      status: "active",
      lastLogin: "-",
      updatedAt: new Date(),
    },
  });
  console.log(`Created user: ${def.email}`);
}

async function main() {
  // Ensure Admin stays wildcard
  const admin = await prisma.role.findFirst({ where: { name: "Admin" } });
  if (admin) {
    await prisma.role.update({
      where: { id: admin.id },
      data: { permissions: JSON.stringify(["*"]), type: "System" },
    });
  }

  for (const def of ROLE_DEFS) {
    const role = await ensureRole(def);
    const userDef = USER_DEFS.find((u) => u.roleName === def.name);
    if (userDef) await ensureUser(userDef, role.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
