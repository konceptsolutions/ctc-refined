import { PrismaClient } from "@prisma/client";
import { expandPermissionAncestors } from "../permissions/catalog";

const prisma = new PrismaClient();

async function main() {
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
      console.log("OK", role.name, "*");
      continue;
    }
    const next = expandPermissionAncestors(perms);
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: JSON.stringify(next) },
    });
    console.log("Expanded", role.name, perms.length, "->", next.length);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
