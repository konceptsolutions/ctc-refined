const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const a = await p.account.findMany({
    where: {
      OR: [
        { code: { startsWith: '101' } },
        { name: { contains: 'Inventory', mode: 'insensitive' } },
      ],
      status: 'Active',
    },
    include: { Subgroup: true },
    orderBy: { code: 'asc' },
    take: 50,
  });
  console.log(
    'accounts',
    a.map((x) => ({
      code: x.code,
      name: x.name,
      sg: x.Subgroup?.code,
      bal: x.currentBalance,
    })),
  );

  const v = await p.voucher.findMany({
    where: { voucherNumber: { in: ['JV4556', 'JV4557'] } },
    include: { VoucherEntry: true },
  });
  console.log(JSON.stringify(v, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await p.$disconnect();
  } catch (_) {}
  process.exit(1);
});
