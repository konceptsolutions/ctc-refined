import { PrismaClient } from "@prisma/client";
import { keysForPages, expandPermissionAncestors } from "../permissions/catalog";

const prisma = new PrismaClient();

async function main() {
  const extra = keysForPages([
    "inventory.dashboard",
    "inventory.multi-dimensional",
    "inventory.stock-analysis",
  ]);
  const roles = await prisma.role.findMany();
  for (const role of roles) {
    let perms: string[] = [];
    try {
      perms = JSON.parse(role.permissions || "[]");
      if (!Array.isArray(perms)) perms = [];
    } catch {
      perms = [];
    }
    if (perms.includes("*")) {
      console.log("skip", role.name);
      continue;
    }
    if (!perms.includes("module.inventory")) {
      console.log("no inventory", role.name);
      continue;
    }
    const merged = expandPermissionAncestors([...new Set([...perms, ...extra])]);
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: JSON.stringify(merged) },
    });
    console.log("updated", role.name, perms.length, "->", merged.length);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
