const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany({
    where: {
      OR: [
        { name: { contains: "Inventory" } },
        { name: { contains: "COGS" } },
        { name: { contains: "Cost" } },
        { name: { contains: "Discount" } },
      ],
    },
    select: { id: true, name: true, code: true },
  });
  console.log(JSON.stringify(accounts, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
