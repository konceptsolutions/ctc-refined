import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@ctc.com";
  const adminName = "System Administrator";
  const adminPassword = "admin123";
  const adminRole = "Admin";

  // 1. Check if Admin role exists
  let role = await prisma.role.findFirst({
    where: { name: adminRole },
  });

  if (!role) {
    console.log(`Creating ${adminRole} role...`);
    role = await prisma.role.create({
      data: {
        id: randomUUID(),
        name: adminRole,
        type: "System",
        description: "Full system access",
        permissions: JSON.stringify(["*"]),
        usersCount: 0,
        updatedAt: new Date(),
      },
    });
  }

  // 2. Check if Admin user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingUser) {
    console.log(`User with email ${adminEmail} already exists.`);
    return;
  }

  // 3. Create Admin user
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: adminRole,
      status: "active",
      lastLogin: "-",
      updatedAt: new Date(),
    },
  });

  console.log(`Admin user created successfully!`);
  console.log(`Email: ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
