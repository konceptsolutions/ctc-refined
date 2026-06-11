import prisma from '../config/database';
import { syncSalesInvoiceReturnStatus } from '../utils/salesInvoiceReturnStatus';

async function main() {
  console.log('Syncing sale invoice return status from completed sales returns...');

  const completedReturns = await prisma.salesReturn.findMany({
    where: { status: 'completed' },
    select: { salesInvoiceId: true },
    distinct: ['salesInvoiceId'],
  });

  let returnCount = 0;
  let partialCount = 0;

  for (const row of completedReturns) {
    const status = await syncSalesInvoiceReturnStatus(row.salesInvoiceId);
    if (status === 'return') returnCount += 1;
    if (status === 'partially_return') partialCount += 1;
  }

  console.log(
    `Done. Updated ${completedReturns.length} invoice(s): ${returnCount} return, ${partialCount} partially_return.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
