import { Pool, type PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __indraPgPool: Pool | undefined;
}

function postgresUrl(): string | null {
  const raw =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    "";
  const url = raw.trim();
  if (!url) return null;
  // Avoid verify-full / channel-binding failures on serverless
  return url
    .replace(/([?&])sslmode=[^&]*/gi, "$1sslmode=require")
    .replace(/([?&])channel_binding=[^&]*/gi, "$1")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
}

/**
 * Relational Postgres (Supabase) when SQL Server is not available.
 * Prefer this over the JSON durable blob once tables are created.
 */
export function isPostgresEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true") return false;
  return Boolean(postgresUrl());
}

export async function getPgPool(): Promise<Pool> {
  const connectionString = postgresUrl();
  if (!connectionString) {
    throw new Error("POSTGRES_URL is not configured");
  }
  if (!globalThis.__indraPgPool) {
    globalThis.__indraPgPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }
  return globalThis.__indraPgPool;
}

export async function withPgTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = await getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function pgQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = await getPgPool();
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function pgQueryOne<
  T extends Record<string, unknown> = Record<string, unknown>,
>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await pgQuery<T>(text, params);
  return rows[0] ?? null;
}
