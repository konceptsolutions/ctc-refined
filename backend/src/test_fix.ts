import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Attempting to create a category...");
        const category = await prisma.category.create({
            data: {
                name: "Test Category " + Date.now(),
                status: "active",
            },
        });
        console.log("Category created successfully:", category);

        console.log("Attempting to create a part...");
        const part = await prisma.part.create({
            data: {
                partNo: "TEST-PART-" + Date.now(),
                description: "Test part",
                status: "active",
            },
        });
        console.log("Part created successfully:", part);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
