const sql = require("mssql");
const { getSqlConfig } = require("./db-config");

(async () => {
  const base = getSqlConfig();
  const names = [
    base.database,
    "Indra_T_DB",
    "INDRA_DB",
    "indra_ticketing",
    "ssipl",
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const db of names) {
    try {
      const p = await new sql.ConnectionPool({ ...base, database: db }).connect();
      const t = await p.request().query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
      );
      console.log(
        db + ":",
        t.recordset.map((r) => r.TABLE_NAME).join(", ") || "(no tables)"
      );
      await p.close();
    } catch (e) {
      console.log(db + ": ERR", e.message);
    }
  }
})();
