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

    const jTransactions = await prisma.journalLine.findMany({
        where: {
            Account: {
                Subgroup: {
                    MainGroup: {
                        type: { in: ["Revenue", "Expense", "Cost", "revenue", "expense", "cost"] }
                    }
                }
            },
            JournalEntry: {
                status: "posted"
            }
        },
        include: {
            Account: true,
            JournalEntry: true
        }
    });

    console.log(`\nFound ${jTransactions.length} Revenue/Expense/Cost transactions via Journals.`);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
