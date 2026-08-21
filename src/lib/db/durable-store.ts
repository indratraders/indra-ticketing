import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";
import {
  createSeedStore,
  getStore,
  replaceStore,
  type DemoStore,
} from "@/lib/db/demo-store";

const STORE_ID = "main";
const ADVISORY_LOCK_KEY = 87236401;
const als = new AsyncLocalStorage<{ active: boolean }>();

declare global {
  // eslint-disable-next-line no-var
  var __indraPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __indraStoreTableReady: boolean | undefined;
}

function postgresUrl(): string | null {
  const url =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    "";
  return url.trim() || null;
}

function supabaseCreds(): { url: string; key: string } | null {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  if (!url || !key) return null;
  return { url, key };
}

function redisCreds(): { url: string; token: string } | null {
  const url = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  ).replace(/\/$/, "");
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) return null;
  return { url, token };
}

export function isDurableStoreEnabled(): boolean {
  return Boolean(postgresUrl() || supabaseCreds() || redisCreds());
}

export function durableStoreBackend():
  | "supabase"
  | "supabase-rest"
  | "redis"
  | null {
  if (postgresUrl()) return "supabase";
  if (supabaseCreds()) return "supabase-rest";
  if (redisCreds()) return "redis";
  return null;
}

function getPool(): Pool {
  const connectionString = postgresUrl();
  if (!connectionString) {
    throw new Error("POSTGRES_URL is not configured");
  }
  if (!globalThis.__indraPgPool) {
    globalThis.__indraPgPool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
      ssl: connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    });
  }
  return globalThis.__indraPgPool;
}

function isStoreShape(value: unknown): value is DemoStore {
  if (!value || typeof value !== "object") return false;
  const store = value as DemoStore;
  return (
    Array.isArray(store.users) &&
    Array.isArray(store.tokens) &&
    Array.isArray(store.vehicles) &&
    typeof store.lastQueueSequence === "number"
  );
}

async function ensureTable(client: PoolClient): Promise<void> {
  if (globalThis.__indraStoreTableReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.app_store (
      id text PRIMARY KEY,
      payload jsonb NOT NULL,
      version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  globalThis.__indraStoreTableReady = true;
}

async function loadFromPostgres(client: PoolClient): Promise<void> {
  await ensureTable(client);
  const result = await client.query<{ payload: DemoStore }>(
    `SELECT payload FROM public.app_store WHERE id = $1 FOR UPDATE`,
    [STORE_ID]
  );
  const row = result.rows[0];
  if (row && isStoreShape(row.payload)) {
    replaceStore(row.payload);
    return;
  }
  const seeded = createSeedStore();
  replaceStore(seeded);
  await client.query(
    `INSERT INTO public.app_store (id, payload, version, updated_at)
     VALUES ($1, $2::jsonb, 1, now())
     ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload,
           version = public.app_store.version + 1,
           updated_at = now()`,
    [STORE_ID, JSON.stringify(seeded)]
  );
}

async function saveToPostgres(client: PoolClient): Promise<void> {
  const store = getStore();
  await client.query(
    `INSERT INTO public.app_store (id, payload, version, updated_at)
     VALUES ($1, $2::jsonb, 1, now())
     ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload,
           version = public.app_store.version + 1,
           updated_at = now()`,
    [STORE_ID, JSON.stringify(store)]
  );
}

async function runWithPostgres<T>(fn: () => T | Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    await loadFromPostgres(client);
    const result = await fn();
    await saveToPostgres(client);
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

async function supabaseRest(
  path: string,
  init: RequestInit & { prefer?: string } = {}
): Promise<Response> {
  const creds = supabaseCreds();
  if (!creds) throw new Error("Supabase is not configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", creds.key);
  headers.set("Authorization", `Bearer ${creds.key}`);
  headers.set("Content-Type", "application/json");
  if (init.prefer) headers.set("Prefer", init.prefer);
  return fetch(`${creds.url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithSupabaseRest<T>(fn: () => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const getRes = await supabaseRest(
      `/rest/v1/app_store?id=eq.${encodeURIComponent(STORE_ID)}&select=payload,version`
    );
    if (getRes.status === 404 || getRes.status === 406) {
      throw new Error(
        "Supabase table public.app_store is missing. Run scripts/setup-supabase.sql in the Supabase SQL editor."
      );
    }
    if (!getRes.ok) {
      const body = await getRes.text().catch(() => "");
      if (body.includes("Could not find the table")) {
        throw new Error(
          "Supabase table public.app_store is missing. Run scripts/setup-supabase.sql in the Supabase SQL editor."
        );
      }
      throw new Error(`Supabase read failed (${getRes.status}) ${body}`.trim());
    }

    const rows = (await getRes.json()) as Array<{
      payload: unknown;
      version: number;
    }>;
    let version = 0;
    if (rows[0] && isStoreShape(rows[0].payload)) {
      replaceStore(rows[0].payload);
      version = Number(rows[0].version) || 0;
    } else {
      const seeded = createSeedStore();
      replaceStore(seeded);
      const insertRes = await supabaseRest(`/rest/v1/app_store`, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: JSON.stringify({
          id: STORE_ID,
          payload: seeded,
          version: 1,
        }),
      });
      if (!insertRes.ok) {
        const body = await insertRes.text().catch(() => "");
        if (body.includes("Could not find the table")) {
          throw new Error(
            "Supabase table public.app_store is missing. Run scripts/setup-supabase.sql in the Supabase SQL editor."
          );
        }
        // concurrent insert — retry
        await sleep(60);
        continue;
      }
      version = 1;
    }

    const result = await fn();
    const nextVersion = version + 1;
    const patchRes = await supabaseRest(
      `/rest/v1/app_store?id=eq.${encodeURIComponent(STORE_ID)}&version=eq.${version}`,
      {
        method: "PATCH",
        prefer: "return=representation",
        body: JSON.stringify({
          payload: getStore(),
          version: nextVersion,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => "");
      throw new Error(`Supabase write failed (${patchRes.status}) ${body}`.trim());
    }
    const patched = (await patchRes.json()) as unknown[];
    if (patched.length > 0 || version === 0) {
      return result;
    }
    // version conflict — another instance won; retry
    await sleep(50 + attempt * 20);
  }
  throw new Error("Queue is busy. Please try again in a moment.");
}

async function redisCommand(args: string[]): Promise<unknown> {
  const creds = redisCreds();
  if (!creds) return null;
  const res = await fetch(`${creds.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([args]),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Durable store error (${res.status}) ${body}`.trim());
  }
  const json = (await res.json()) as Array<{ result?: unknown }>;
  return json[0]?.result ?? null;
}

async function loadFromRedis(): Promise<void> {
  const raw = await redisCommand(["GET", "indra-ticketing:v1:store"]);
  if (typeof raw === "string" && raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isStoreShape(parsed)) {
        replaceStore(parsed);
        return;
      }
    } catch {
      // fall through
    }
  }
  if (raw && typeof raw === "object" && isStoreShape(raw)) {
    replaceStore(raw);
    return;
  }
  const seeded = createSeedStore();
  replaceStore(seeded);
  await redisCommand(["SET", "indra-ticketing:v1:store", JSON.stringify(seeded)]);
}

async function saveToRedis(): Promise<void> {
  await redisCommand([
    "SET",
    "indra-ticketing:v1:store",
    JSON.stringify(getStore()),
  ]);
}

async function runWithRedis<T>(fn: () => T | Promise<T>): Promise<T> {
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < 30; attempt++) {
    const got = await redisCommand([
      "SET",
      "indra-ticketing:v1:lock",
      lockId,
      "NX",
      "EX",
      "12",
    ]);
    if (got === "OK") {
      try {
        await loadFromRedis();
        const result = await fn();
        await saveToRedis();
        return result;
      } finally {
        await redisCommand(["DEL", "indra-ticketing:v1:lock"]).catch(
          () => undefined
        );
      }
    }
    await sleep(70);
  }
  throw new Error("Queue is busy. Please try again in a moment.");
}

/**
 * Load the shared queue from Supabase Postgres (preferred), Supabase REST, or Redis.
 * Nested calls share the same transaction so issue-token does not double-lock.
 */
export async function runWithDurableStore<T>(
  fn: () => T | Promise<T>
): Promise<T> {
  if (!isDurableStoreEnabled() || als.getStore()?.active) {
    return await fn();
  }

  return als.run({ active: true }, async () => {
    if (postgresUrl()) {
      try {
        return await runWithPostgres(fn);
      } catch (error) {
        // Fall back to REST if direct Postgres is blocked from this host.
        if (supabaseCreds()) return runWithSupabaseRest(fn);
        throw error;
      }
    }
    if (supabaseCreds()) return runWithSupabaseRest(fn);
    return runWithRedis(fn);
  });
}
