import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const mainGroups = await prisma.mainGroup.findMany({
        select: {
            id: true,
            name: true,
            code: true,
            type: true
        }
    });

    console.log("Main Groups:");
    console.log(JSON.stringify(mainGroups, null, 2));

    const accounts = await prisma.account.findMany({
        take: 5,
        include: {
            Subgroup: {
                include: {
                    MainGroup: true
                }
            }
        }
    });

    console.log("\nSample Accounts with hierarchy:");
    accounts.forEach((acc: any) => {
        console.log(`Account: ${acc.name}, Code: ${acc.code}, Subgroup: ${acc.Subgroup.name}, MainGroup Type: ${acc.Subgroup.MainGroup.type}`);
    });

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
