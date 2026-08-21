/**
 * Ensure public.app_store exists on Supabase Postgres.
 * Usage: npm run db:supabase
 * Reads POSTGRES_* from process env, .env.local, or .env.vercel.tmp
 */
require("./load-env");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadExtraEnv(filename) {
  const file = path.join(__dirname, "..", filename);
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadExtraEnv(".env.vercel.tmp");

async function main() {
  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Missing POSTGRES_URL. Pull Vercel env (vercel env pull) or paste the Supabase connection string."
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
  });

  const sql = fs.readFileSync(path.join(__dirname, "setup-supabase.sql"), "utf8");
  await pool.query(sql);
  console.log("Supabase app_store table is ready.");
  await pool.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
