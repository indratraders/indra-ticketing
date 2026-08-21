import sql, { type ConnectionPool, type config as SqlConfig } from "mssql";

function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return raw.toLowerCase() === "true" || raw === "1";
}

function hasSqlCredentials(): boolean {
  return Boolean(
    process.env.DB_SERVER?.trim() &&
      process.env.DB_USER?.trim() &&
      process.env.DB_PASSWORD != null &&
      process.env.DB_NAME?.trim()
  );
}

/**
 * SQL Server is used when:
 * - NEXT_PUBLIC_ENABLE_DEMO_MODE=false, or
 * - demo mode is unset and DB_* credentials are present
 *
 * Set NEXT_PUBLIC_ENABLE_DEMO_MODE=true to force the in-memory store.
 */
export function isSqlServerEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true") return false;
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "false") return true;
  return hasSqlCredentials();
}

export function getSqlConfig(): SqlConfig {
  const server = process.env.DB_SERVER?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim() || "indra_ticketing";

  if (!server || !user || password == null) {
    throw new Error(
      "SQL Server is enabled but DB_SERVER, DB_USER, or DB_PASSWORD is missing. Set them in .env on the server."
    );
  }

  const config: SqlConfig = {
    user,
    password,
    server,
    port: Number(process.env.DB_PORT || 1433),
    database,
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    options: {
      encrypt: envFlag("DB_ENCRYPT", false),
      trustServerCertificate: envFlag("DB_TRUST_SERVER_CERTIFICATE", true),
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };

  const instance = process.env.DB_INSTANCE?.trim();
  if (instance && config.options) {
    config.options.instanceName = instance;
  }

  return config;
}

declare global {
  // eslint-disable-next-line no-var
  var __indraSqlPool: ConnectionPool | undefined;
}

export async function getSqlPool(): Promise<ConnectionPool> {
  if (globalThis.__indraSqlPool?.connected) {
    return globalThis.__indraSqlPool;
  }

  const config = getSqlConfig();
  try {
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    globalThis.__indraSqlPool = pool;
    return pool;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot connect to SQL Server ${config.server}:${config.port ?? 1433} database "${config.database}". ${detail}`
    );
  }
}

export { sql };
