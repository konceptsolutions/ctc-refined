/**
 * Diagnostic: run with: npx ts-node --project tsconfig.json src/debug_prs.ts
 * Checks PartRackShelf records for all parts sharing a partNo
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const partNo = "144911";

  const parts = await prisma.part.findMany({
    where: { partNo },
    include: {
      Brand: true,
      PartRackShelf: {
        include: { Store: true, Rack: true, Shelf: true },
      },
    },
  });

  console.log(`\nFound ${parts.length} parts with partNo="${partNo}":`);
  for (const p of parts) {
    const smIn = await prisma.stockMovement.aggregate({
      where: { partId: p.id, type: "in" },
      _sum: { quantity: true },
    });
    const smOut = await prisma.stockMovement.aggregate({
      where: { partId: p.id, type: "out" },
      _sum: { quantity: true },
    });
    const net = (smIn._sum.quantity || 0) - (smOut._sum.quantity || 0);

    console.log(`\n  [Brand: ${p.Brand?.name || "N/A"}]  ID: ${p.id}`);
    console.log(
      `    Stock Movements => IN: ${smIn._sum.quantity}, OUT: ${smOut._sum.quantity}, NET: ${net}`,
    );
    console.log(`    PartRackShelf rows: ${p.PartRackShelf.length}`);
    for (const row of p.PartRackShelf) {
      console.log(
        `      Store: ${row.Store?.name}, Rack: ${row.Rack?.codeNo}, Shelf: ${row.Shelf?.shelfNo}, Qty: ${row.quantity}`,
      );
    }
    if (p.PartRackShelf.length === 0) {
      console.log("      (NO PartRackShelf records for this partId)");
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
