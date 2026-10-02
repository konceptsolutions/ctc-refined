const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();
(async () => {
  const returnIds = [
    'c51f3d9d-66ad-4bde-bf9a-c3091bff3a56',
    '5d9f96a5-01a6-4b24-8744-941409266065',
  ];

  const movements = await p.stockMovement.findMany({
    where: {
      OR: [
        { referenceId: { in: returnIds } },
        { referenceType: 'dpo_return' },
      ],
    },
    select: {
      id: true,
      type: true,
      quantity: true,
      referenceType: true,
      referenceId: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log('movements', JSON.stringify(movements, null, 2));

  // Search vouchers by amount / date window around returns
  const v1 = await p.voucher.findMany({
    where: {
      OR: [
        { totalDebit: 22000 },
        { totalCredit: 22000 },
        { totalDebit: 36000 },
        { totalCredit: 36000 },
      ],
      date: {
        gte: new Date('2026-08-01'),
        lte: new Date('2026-09-01'),
      },
    },
    select: {
      voucherNumber: true,
      type: true,
      narration: true,
      totalDebit: true,
      date: true,
      createdAt: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log('vouchersByAmount', JSON.stringify(v1, null, 2));

  // Broad search notes containing DPOR
  const v2 = await p.$queryRawUnsafe(`
    SELECT "voucherNumber", type, narration, "totalDebit", date, "createdAt", status
    FROM "Voucher"
    WHERE narration ILIKE '%DPOR%'
       OR narration ILIKE '%dpo return%'
       OR narration ILIKE '%return%DPO%'
       OR narration ILIKE '%061%'
       OR narration ILIKE '%052%'
    ORDER BY "createdAt" DESC
    LIMIT 40
  `);
  console.log('rawVouchers', JSON.stringify(v2, null, 2));

  // Check if create stored any voucher refs on return table
  const returnCols = await p.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'DirectPurchaseOrderReturn'
    ORDER BY column_name
  `);
  console.log('returnCols', returnCols);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
