const sql = require("mssql");
const { getSqlConfig } = require("./db-config");

async function main() {
  const config = getSqlConfig();
  console.log(
    `Checking ${config.server}:${config.port} / ${config.database} as ${config.user}`
  );

  const pool = new sql.ConnectionPool(config);
  await pool.connect();

  const ping = await pool.request().query("SELECT DB_NAME() AS db, @@VERSION AS version");
  const tables = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE='BASE TABLE' AND TABLE_SCHEMA='dbo'
    ORDER BY TABLE_NAME
  `);

  const names = tables.recordset.map((r) => r.TABLE_NAME);
  const required = [
    "users",
    "counters",
    "vehicles",
    "customers",
    "settings",
    "daily_sequences",
    "tokens",
    "token_events",
  ];
  const missing = required.filter((t) => !names.includes(t));

  console.log("Connected database:", ping.recordset[0].db);
  console.log("Tables:", names.join(", ") || "(none)");
  if (missing.length) {
    console.error("Missing tables:", missing.join(", "));
    console.error("Run: npm run db:setup && npm run db:seed");
    await pool.close();
    process.exit(1);
  }

  const users = await pool.request().query("SELECT COUNT(*) AS n FROM dbo.users");
  console.log("Users:", users.recordset[0].n);
  if (users.recordset[0].n === 0) {
    console.error("No users found. Run: npm run db:seed");
    await pool.close();
    process.exit(1);
  }

  console.log("SQL Server is ready.");
  await pool.close();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
