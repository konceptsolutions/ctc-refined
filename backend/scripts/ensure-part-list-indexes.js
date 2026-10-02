const { PrismaClient } = require("../src/generated/prisma");

const prisma = new PrismaClient();

const stmts = [
  `CREATE INDEX IF NOT EXISTS "Part_updatedAt_idx" ON "Part"("updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "Part_status_updatedAt_idx" ON "Part"(status, "updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "Part_partNo_idx" ON "Part"("partNo")`,
  `CREATE INDEX IF NOT EXISTS "Part_masterPartId_idx" ON "Part"("masterPartId")`,
  `CREATE INDEX IF NOT EXISTS "StockMovement_partId_idx" ON "StockMovement"("partId")`,
  `CREATE INDEX IF NOT EXISTS "StockMovement_partId_referenceType_idx" ON "StockMovement"("partId", "referenceType")`,
  `CREATE INDEX IF NOT EXISTS "StockReservation_partId_status_idx" ON "StockReservation"("partId", status)`,
  `CREATE INDEX IF NOT EXISTS "AdjustmentItem_partId_idx" ON "AdjustmentItem"("partId")`,
  `CREATE INDEX IF NOT EXISTS "DirectPurchaseOrderItem_partId_idx" ON "DirectPurchaseOrderItem"("partId")`,
  `CREATE INDEX IF NOT EXISTS "SalesInvoiceItem_partId_idx" ON "SalesInvoiceItem"("partId")`,
];

(async () => {
  for (const sql of stmts) {
    const started = Date.now();
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`OK ${Date.now() - started}ms ${sql}`);
    } catch (error) {
      console.error(`FAIL ${sql}\n${error.message}`);
    }
  }
  await prisma.$disconnect();
})();
