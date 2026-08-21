import { AsyncLocalStorage } from "node:async_hooks";
import {
  createSeedStore,
  getStore,
  replaceStore,
  type DemoStore,
} from "@/lib/db/demo-store";

const STORE_KEY = "indra-ticketing:v1:store";
const LOCK_KEY = "indra-ticketing:v1:lock";

const als = new AsyncLocalStorage<{ active: boolean }>();

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
  return redisCreds() !== null;
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

async function loadStore(): Promise<void> {
  const raw = await redisCommand(["GET", STORE_KEY]);
  if (typeof raw === "string" && raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isStoreShape(parsed)) {
        replaceStore(parsed);
        return;
      }
    } catch {
      // fall through to seed
    }
  }
  if (raw && typeof raw === "object" && isStoreShape(raw)) {
    replaceStore(raw);
    return;
  }
  const seeded = createSeedStore();
  replaceStore(seeded);
  await redisCommand(["SET", STORE_KEY, JSON.stringify(seeded)]);
}

async function saveStore(): Promise<void> {
  const store = getStore();
  await redisCommand(["SET", STORE_KEY, JSON.stringify(store)]);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < 30; attempt++) {
    const got = await redisCommand([
      "SET",
      LOCK_KEY,
      lockId,
      "NX",
      "EX",
      "12",
    ]);
    if (got === "OK") {
      try {
        return await fn();
      } finally {
        await redisCommand(["DEL", LOCK_KEY]).catch(() => undefined);
      }
    }
    await sleep(70);
  }
  throw new Error("Queue is busy. Please try again in a moment.");
}

/**
 * Load the shared queue from Redis for this request, run `fn`, then persist.
 * Nested calls share the same transaction so issue-token does not double-lock.
 */
export async function runWithDurableStore<T>(
  fn: () => T | Promise<T>
): Promise<T> {
  if (!isDurableStoreEnabled() || als.getStore()?.active) {
    return await fn();
  }

  return als.run({ active: true }, async () =>
    withLock(async () => {
      await loadStore();
      const result = await fn();
      await saveStore();
      return result;
    })
  );
}
