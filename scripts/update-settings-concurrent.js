const sql = require("mssql");
const { getSqlConfig } = require("./db-config");

(async () => {
  const pool = await new sql.ConnectionPool(getSqlConfig()).connect();
  await pool.request().query(`
    UPDATE dbo.settings
    SET upcomingTokensCount = 6,
        companyName = N'Indra Traders (PVT) LTD — Colombo'
  `);
  console.log("settings updated");
  await pool.close();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
