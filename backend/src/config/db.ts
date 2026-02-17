import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

// Load env vars
const envFile =
  process.env.NODE_ENV === "production" ? ".env.production" : ".env";
const envPath = path.resolve(__dirname, `../../${envFile}`);
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
