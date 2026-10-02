const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  // Any 19800 anywhere in returns/items/vouchers/dpo
  const q = await p.$queryRawUnsafe(`
    SELECT 'return' as src, "returnNumber" as ref, "totalAmount"::text as amt, "createdAt"
    FROM "DirectPurchaseOrderReturn" WHERE "totalAmount" = 19800
    UNION ALL
    SELECT 'return_item', "dpoReturnId", amount::text, "createdAt"
    FROM "DirectPurchaseOrderReturnItem" WHERE amount = 19800 OR amount = 9900
    UNION ALL
    SELECT 'voucher', "voucherNumber", "totalDebit"::text, "createdAt"
    FROM "Voucher" WHERE "totalDebit" = 19800 OR "totalCredit" = 19800
    UNION ALL
    SELECT 'dpo', "dpoNumber", "totalAmount"::text, "createdAt"
    FROM "DirectPurchaseOrder" WHERE "totalAmount" = 19800
    ORDER BY "createdAt" DESC
  `);
  console.log('19800 hits', q);

  // Ali Traders payable account
  const acc = await p.account.findMany({
    where: {
      OR: [
        { name: { contains: 'Ali', mode: 'insensitive' } },
        { supplierId: '08e1fb60-a4dd-48dc-97fd-8b66034e5090' },
      ],
    },
    select: { id: true, code: true, name: true, supplierId: true, status: true, currentBalance: true },
  });
  console.log('ali accounts', acc);

  // Most recent DPO for amounts that could be partial return of 19800
  // e.g. price 9900 * 2
  const items = await p.$queryRawUnsafe(`
    SELECT d."dpoNumber", s.name, p."partNo", i.quantity, i."purchasePrice",
           (i.quantity * i."purchasePrice") as line_total, d."createdAt"
    FROM "DirectPurchaseOrderItem" i
    JOIN "DirectPurchaseOrder" d ON d.id = i."directPurchaseOrderId"
    LEFT JOIN "Supplier" s ON s.id = d."supplierId"
    LEFT JOIN "Part" p ON p.id = i."partId"
    WHERE i."purchasePrice" IN (9900, 19800, 6600, 4950)
       OR (i.quantity * i."purchasePrice") = 19800
    ORDER BY d."createdAt" DESC
    LIMIT 20
  `);
  console.log('price match items', items);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
