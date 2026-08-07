/**
 * One-shot migration: expand Role.permissions to the hierarchical catalog keys
 * matching previous hardcoded path/tab allowlists.
 *
 * Usage: npx tsx src/scripts/migrate_role_permissions.ts
 */
import { PrismaClient } from "@prisma/client";
import { getPresetPermissions, getAllPermissionKeys } from "../permissions/catalog";

const prisma = new PrismaClient();

function looksLegacy(permissions: string[]): boolean {
  if (permissions.includes("*")) return false;
  if (permissions.length === 0) return true;
  // Old coarse keys like sales.view / inventory.edit
  const hasNew = permissions.some(
    (k) =>
      k.startsWith("module.") ||
      k.startsWith("page.") ||
      k.startsWith("action.") ||
      k.startsWith("field.") ||
      k.startsWith("section."),
  );
  return !hasNew;
}

async function main() {
  const roles = await prisma.role.findMany();
  const catalogSize = getAllPermissionKeys().length;
  console.log(`Catalog keys: ${catalogSize}`);

  for (const role of roles) {
    let current: string[] = [];
    try {
      current = JSON.parse(role.permissions || "[]");
      if (!Array.isArray(current)) current = [];
    } catch {
      current = [];
    }

    const name = role.name.trim();
    const lower = name.toLowerCase();

    if (lower === "admin") {
      if (!(current.length === 1 && current[0] === "*")) {
        await prisma.role.update({
          where: { id: role.id },
          data: { permissions: JSON.stringify(["*"]) },
        });
        console.log(`Updated Admin → ["*"]`);
      } else {
        console.log(`Admin already has *`);
      }
      continue;
    }

    if (!looksLegacy(current)) {
      console.log(`Skip ${name} (already migrated, ${current.length} keys)`);
      continue;
    }

    const next = getPresetPermissions(name);
    if (next.length === 0) {
      console.log(`No preset for role "${name}" — left unchanged`);
      continue;
    }

    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: JSON.stringify(next) },
    });
    console.log(`Migrated ${name} → ${next.length} permission keys`);
  }

  // Ensure Store User role exists with preset
  const storeRole = await prisma.role.findFirst({
    where: { name: { equals: "Store User", mode: "insensitive" } },
  });
  if (!storeRole) {
    const { randomUUID } = await import("crypto");
    const perms = getPresetPermissions("Store User");
    await prisma.role.create({
      data: {
        id: randomUUID(),
        name: "Store User",
        type: "System",
        description: "Store operations access",
        permissions: JSON.stringify(perms),
        usersCount: 0,
        updatedAt: new Date(),
      },
    });
    console.log(`Created Store User role (${perms.length} keys)`);
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
