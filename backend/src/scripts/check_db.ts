import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const entries = await prisma.voucherEntry.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            accountId: true,
            accountName: true,
            debit: true,
            credit: true,
        }
    });

    console.log("Recent Voucher Entries:");
    console.log(JSON.stringify(entries, null, 2));

    const postedVouchersCount = await prisma.voucher.count({
        where: { status: 'posted' }
    });
    console.log("\nTotal Posted Vouchers:", postedVouchersCount);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
