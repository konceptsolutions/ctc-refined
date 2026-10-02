const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const returns = await p.directPurchaseOrderReturn.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      returnNumber: true,
      status: true,
      totalAmount: true,
      netAmount: true,
      returnDate: true,
      createdAt: true,
      supplierId: true,
      directPurchaseOrderId: true,
    },
  });
  console.log('returns', returns);

  // Also raw
  const raw = await p.$queryRawUnsafe(`
    SELECT id, "returnNumber", status, "totalAmount", "netAmount", "returnDate", "createdAt", "supplierId"
    FROM "DirectPurchaseOrderReturn"
    ORDER BY "createdAt" DESC
    LIMIT 10
  `);
  console.log('raw', raw);

  const ali = await p.$queryRawUnsafe(`
    SELECT id, name, "companyName" FROM "Supplier"
    WHERE name ILIKE '%Ali Traders%' OR "companyName" ILIKE '%Ali Traders%'
    LIMIT 5
  `);
  console.log('ali suppliers', ali);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
