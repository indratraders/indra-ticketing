/**
 * Create the ticketing database (if needed) and ensure tables exist.
 * Reads DB_* from .env / .env.local / process environment.
 *
 * Usage: npm run db:setup
 */
const fs = require("fs");
const path = require("path");
const sql = require("mssql");
const { getSqlConfig } = require("./db-config");

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

function quoteIdent(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Invalid database name: ${name}`);
  }
  return `[${name}]`;
}

async function main() {
  const appConfig = getSqlConfig();
  const targetDb = appConfig.database;

  console.log(
    `Connecting to ${appConfig.server}:${appConfig.port} as ${appConfig.user}`
  );

  const masterPool = new sql.ConnectionPool({
    ...appConfig,
    database: "master",
  });
  await masterPool.connect();

  const existing = await masterPool
    .request()
    .input("name", sql.NVarChar(128), targetDb)
    .query("SELECT name FROM sys.databases WHERE name = @name");

  if (existing.recordset.length === 0) {
    console.log("Creating database", targetDb);
    await masterPool.request().query(`CREATE DATABASE ${quoteIdent(targetDb)}`);
  } else {
    console.log("Database already exists:", targetDb);
  }

  await masterPool.close();

  const pool = new sql.ConnectionPool(appConfig);
  await pool.connect();
  await pool.request().query(SCHEMA_SQL);
  console.log("Tables ensured.");

  const tables = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE='BASE TABLE' AND TABLE_SCHEMA='dbo'
    ORDER BY TABLE_NAME
  `);
  console.log(
    "dbo tables:",
    tables.recordset.map((r) => r.TABLE_NAME).join(", ")
  );

  await pool.close();
  console.log("DONE_DB=" + targetDb);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
