const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  // Find DPOs with total near 19800 or items totaling 19800
  const dpos = await p.$queryRawUnsafe(`
    SELECT d."dpoNumber", d.status, d."totalAmount", s.name as supplier,
           d."createdAt"
    FROM "DirectPurchaseOrder" d
    LEFT JOIN "Supplier" s ON s.id = d."supplierId"
    WHERE d."totalAmount" BETWEEN 19000 AND 21000
       OR d."dpoNumber" ILIKE '%080%'
    ORDER BY d."createdAt" DESC
    LIMIT 30
  `);
  console.log('candidate dpos', dpos);

  // Items that could make 19800 (e.g. 9900*2)
  const items = await p.$queryRawUnsafe(`
    SELECT d."dpoNumber", s.name as supplier, p."partNo", i.quantity, i."purchasePrice",
           (i.quantity * i."purchasePrice") as line_total
    FROM "DirectPurchaseOrderItem" i
    JOIN "DirectPurchaseOrder" d ON d.id = i."directPurchaseOrderId"
    LEFT JOIN "Supplier" s ON s.id = d."supplierId"
    LEFT JOIN "Part" p ON p.id = i."partId"
    WHERE s.name ILIKE '%Ali%'
      AND (i.quantity * i."purchasePrice") BETWEEN 1000 AND 20000
    ORDER BY d."dpoNumber" DESC, p."partNo"
    LIMIT 50
  `);
  console.log('ali items', items);

  // Any return created today
  const todayR = await p.$queryRawUnsafe(`
    SELECT * FROM "DirectPurchaseOrderReturn"
    WHERE "createdAt" >= '2026-10-01' OR "returnDate" >= '2026-10-01'
  `);
  console.log('today returns', todayR);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
