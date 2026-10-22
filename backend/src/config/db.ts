import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

import * as fs from "fs";

// Load env vars (fall back to .env if .env.production is absent)
const preferredEnv =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env";
const preferredPath = path.resolve(__dirname, `../../${preferredEnv}`);
const fallbackPath = path.resolve(__dirname, "../../.env");
const envPath = fs.existsSync(preferredPath) ? preferredPath : fallbackPath;
dotenv.config({ path: envPath, override: true });

// Parse DATABASE_URL for pg config if needed, or just pass it
// DATABASE_URL format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL is missing in .env");
}

const pool = new Pool({
  connectionString,
  ssl: false, // Localhost usually doesn't need SSL
  // Cap so pg + Prisma do not exhaust PostgreSQL max_connections together
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Test connection
pool.on("connect", () => {
  // console.log('🔌 Connected to PostgreSQL via pg driver');
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
  process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

export default pool;
