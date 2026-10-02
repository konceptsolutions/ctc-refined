const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const todayMoves = await p.$queryRawUnsafe(`
    SELECT id, type, quantity, "referenceType", "referenceId", notes, "createdAt", "partId"
    FROM "StockMovement"
    WHERE "createdAt" >= '2026-10-01'
    ORDER BY "createdAt" DESC
    LIMIT 40
  `);
  console.log('today movements', todayMoves);

  const allReturns = await p.$queryRawUnsafe(`
    SELECT "returnNumber", status, "totalAmount", "createdAt", "returnDate"
    FROM "DirectPurchaseOrderReturn"
    ORDER BY "returnNumber"
  `);
  console.log('all returns', allReturns);

  // Max dpo number
  const maxDpo = await p.$queryRawUnsafe(`
    SELECT "dpoNumber" FROM "DirectPurchaseOrder"
    WHERE "dpoNumber" LIKE 'DPO-2026-%'
    ORDER BY "dpoNumber" DESC
    LIMIT 5
  `);
  console.log('max dpo', maxDpo);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
