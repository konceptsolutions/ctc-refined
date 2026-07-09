import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env variables
const envFile =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env";
const envPath = path.join(process.cwd(), envFile);
dotenv.config({ path: envPath, override: true });

const prisma: PrismaClient = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
});

// verify connection
const dbUrl = process.env.DATABASE_URL || "";
console.log(
  `🔌 Database Connection: ${dbUrl.startsWith("postgresql") ? "PostgreSQL ✅" : "UNKNOWN ❌"} (${dbUrl.split("@")[1] || "..."})`,
);

// Handle graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
