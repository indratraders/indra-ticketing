require("./load-env");

function missing(name) {
  return !String(process.env[name] ?? "").trim();
}

function getSqlConfig(database) {
  if (missing("DB_SERVER") || missing("DB_USER") || process.env.DB_PASSWORD == null) {
    throw new Error(
      "Missing DB_SERVER, DB_USER, or DB_PASSWORD. Copy .env.example to .env (or .env.local) and set SQL Server details."
    );
  }

  const server = String(process.env.DB_SERVER).trim();
  const user = String(process.env.DB_USER).trim();
  const password = String(process.env.DB_PASSWORD);
  const db = String(database || process.env.DB_NAME || "indra_ticketing").trim();
  const port = Number(process.env.DB_PORT || 1433);
  const encrypt = String(process.env.DB_ENCRYPT || "false").toLowerCase() === "true";
  const trustServerCertificate =
    String(process.env.DB_TRUST_SERVER_CERTIFICATE || "true").toLowerCase() !==
    "false";

  /** @type {import("mssql").config} */
  const config = {
    user,
    password,
    server,
    port,
    database: db,
    connectionTimeout: 30000,
    requestTimeout: 60000,
    options: {
      encrypt,
      trustServerCertificate,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  const instance = String(process.env.DB_INSTANCE || "").trim();
  if (instance) {
    config.options.instanceName = instance;
  }

  return config;
}

module.exports = { getSqlConfig };
