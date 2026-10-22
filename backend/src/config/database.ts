import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

import * as fs from "fs";

// Load .env variables (fall back to .env if .env.production is absent)
const preferredEnv =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env";
const preferredPath = path.join(process.cwd(), preferredEnv);
const fallbackPath = path.join(process.cwd(), ".env");
const envPath = fs.existsSync(preferredPath) ? preferredPath : fallbackPath;
dotenv.config({ path: envPath, override: true });

/**
 * Ensure Prisma has a usable connection pool. On 1–2 vCPU hosts the Prisma
 * default is often only ~3 connections, which starves concurrent API calls
 * (P2024 pool timeouts) and makes data loading feel slow.
 */
function ensurePoolParams(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT || "20");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT || "30");
    }
    if (!u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", "10");
    }
    return u.toString();
  } catch {
    return url;
  }
}

const rawUrl = process.env.DATABASE_URL || "";
const pooledUrl = ensurePoolParams(rawUrl);
if (pooledUrl && pooledUrl !== rawUrl) {
  process.env.DATABASE_URL = pooledUrl;
}

declare global {
  // eslint-disable-next-line no-var
  var __ctcPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development" &&
      process.env.PRISMA_LOG_QUERIES === "1"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// Singleton across hot-reloads / accidental multi-imports
export const prisma: PrismaClient =
  global.__ctcPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__ctcPrisma = prisma;
}

const dbUrl = process.env.DATABASE_URL || "";
const safeHost = dbUrl.split("@")[1]?.split("?")[0] || "...";
const limit =
  (() => {
    try {
      return new URL(dbUrl).searchParams.get("connection_limit") || "?";
    } catch {
      return "?";
    }
  })();
console.log(
  `🔌 Database Connection: ${dbUrl.startsWith("postgresql") ? "PostgreSQL ✅" : "UNKNOWN ❌"} (${safeHost}, pool=${limit})`,
);

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
