import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const ROLE_DEFS = [
  {
    name: "Manager",
    description: "Operations and inventory oversight",
    permissions: [
      "users.view",
      "inventory.view",
      "inventory.create",
      "inventory.edit",
      "sales.view",
      "sales.create",
      "sales.edit",
      "reports.view",
      "reports.export",
      "settings.view",
    ],
  },
  {
    name: "Accountant",
    description: "Accounting and financial reports",
    permissions: [
      "reports.view",
      "reports.export",
      "settings.view",
      "inventory.view",
      "sales.view",
    ],
  },
  {
    name: "Sales",
    description: "Sales and customer operations",
    permissions: [
      "sales.view",
      "sales.create",
      "sales.edit",
      "inventory.view",
      "reports.view",
    ],
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
  const existing = await prisma.role.findFirst({
    where: { name: def.name },
  });

  if (existing) {
    console.log(`Role already exists: ${def.name} (${existing.id})`);
    return existing;
  }

  const role = await prisma.role.create({
    data: {
      id: randomUUID(),
      name: def.name,
      type: "Custom",
      description: def.description,
      permissions: JSON.stringify(def.permissions),
      usersCount: 0,
      updatedAt: new Date(),
    },
  });

  console.log(`Created role: ${role.name} (${role.id})`);
  return role;
}

async function ensureUser(
  def: (typeof USER_DEFS)[number],
  roleId: string,
) {
  const existing = await prisma.user.findUnique({
    where: { email: def.email },
  });

  if (existing) {
    // Keep role assignment in sync if user already exists
    if (existing.roleId !== roleId) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { roleId, updatedAt: new Date() },
      });
      console.log(`Updated existing user role: ${def.email} -> ${def.roleName}`);
    } else {
      console.log(`User already exists: ${def.email}`);
    }
    return existing;
  }

  const hashedPassword = await bcrypt.hash(def.password, 10);
  const user = await prisma.user.create({
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

  console.log(`Created user: ${user.email} / ${def.password} (${def.roleName})`);
  return user;
}

async function main() {
  console.log("Seeding Manager, Accountant, and Sales roles/users...");

  const rolesByName = new Map<string, { id: string; name: string }>();

  for (const roleDef of ROLE_DEFS) {
    const role = await ensureRole(roleDef);
    rolesByName.set(role.name, role);
  }

  for (const userDef of USER_DEFS) {
    const role = rolesByName.get(userDef.roleName);
    if (!role) {
      throw new Error(`Role not found for user ${userDef.email}: ${userDef.roleName}`);
    }
    await ensureUser(userDef, role.id);
  }

  // Refresh usersCount on roles
  for (const role of rolesByName.values()) {
    const usersCount = await prisma.user.count({ where: { roleId: role.id } });
    await prisma.role.update({
      where: { id: role.id },
      data: { usersCount, updatedAt: new Date() },
    });
  }

  console.log("\nDone. Login credentials:");
  for (const user of USER_DEFS) {
    console.log(`- ${user.roleName}: ${user.email} / ${user.password}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
