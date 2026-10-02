const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();
(async () => {
  const groups = await p.salesReturn.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('byStatus', JSON.stringify(groups, null, 2));
  const sample = await p.salesReturn.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      returnNumber: true,
      status: true,
      isDirectReturn: true,
      createdAt: true,
    },
  });
  console.log('sample', JSON.stringify(sample, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
