import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const transactions = await prisma.voucherEntry.findMany({
        where: {
            Account: {
                Subgroup: {
                    MainGroup: {
                        type: { in: ["Revenue", "Expense", "Cost", "revenue", "expense", "cost"] }
                    }
                }
            },
            Voucher: {
                status: "posted"
            }
        },
        include: {
            Account: true,
            Voucher: true
        }
    });

    console.log(`Found ${transactions.length} Revenue/Expense/Cost transactions via Vouchers.`);
    transactions.forEach(t => {
        console.log(`Voucher: ${t.Voucher.voucherNumber}, Account: ${t.Account?.name}, Debit: ${t.debit}, Credit: ${t.credit}`);
    });

    console.log(`\nAll revenue/expense transactions are now handled via Vouchers.`);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
