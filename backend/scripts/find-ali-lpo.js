const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('DATABASE_URL', process.env.DATABASE_URL);

  const d = await p.directPurchaseOrder.findMany({
    where: { supplierId: '08e1fb60-a4dd-48dc-97fd-8b66034e5090' },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      dpoNumber: true,
      status: true,
      totalAmount: true,
      createdAt: true,
    },
  });
  console.log('ali dpos', d);

  const recent = await p.$queryRawUnsafe(`
    SELECT "dpoNumber", status, "totalAmount", "createdAt"
    FROM "DirectPurchaseOrder"
    ORDER BY "createdAt" DESC
    LIMIT 20
  `);
  console.log('recent dpos', recent);

  const retCount = await p.directPurchaseOrderReturn.count();
  console.log('return count', retCount);

  // search any narration with 19800
  const v = await p.voucher.findMany({
    where: {
      OR: [{ totalDebit: 19800 }, { totalCredit: 19800 }],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      voucherNumber: true,
      type: true,
      narration: true,
      createdAt: true,
      totalDebit: true,
    },
  });
  console.log('vouchers 19800', v);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
