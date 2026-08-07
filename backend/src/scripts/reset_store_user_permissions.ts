import { PrismaClient } from "@prisma/client";
import { getPresetPermissions } from "../permissions/catalog";

const prisma = new PrismaClient();

/** Keep Store User locked to current-stock + store only. */
async function main() {
  const role = await prisma.role.findFirst({
    where: { name: { equals: "Store User", mode: "insensitive" } },
  });
  if (!role) {
    console.log("Store User role not found");
    return;
  }
  const perms = getPresetPermissions("Store User");
  await prisma.role.update({
    where: { id: role.id },
    data: { permissions: JSON.stringify(perms) },
  });
  console.log("Reset Store User to", perms.length, "keys");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
