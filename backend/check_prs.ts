import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Find all parts with partNo = '144911'
  const parts = await prisma.part.findMany({
    where: { partNo: "144911" },
    include: {
      Brand: true,
      PartRackShelf: {
        include: { Store: true, Rack: true, Shelf: true },
      },
      StockMovement: true,
    },
  });

  for (const p of parts) {
    const stockIn = p.StockMovement.filter((m) => m.type === "in").reduce(
      (s, m) => s + m.quantity,
      0,
    );
    const stockOut = p.StockMovement.filter((m) => m.type === "out").reduce(
      (s, m) => s + m.quantity,
      0,
    );
    console.log(`\n=== Part: ${p.id} | Brand: ${p.Brand?.name} ===`);
    console.log(
      `  Stock Movements: IN=${stockIn}, OUT=${stockOut}, NET=${stockIn - stockOut}`,
    );
    console.log(`  PartRackShelf records (${p.PartRackShelf.length}):`);
    for (const prs of p.PartRackShelf) {
      console.log(
        `    Store=${prs.Store?.name}, Rack=${prs.Rack?.codeNo}, Shelf=${prs.Shelf?.shelfNo}, Qty=${prs.quantity}`,
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
