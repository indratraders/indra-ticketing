/**
 * Supabase PostgREST helper — preferred on Vercel to avoid pg session-pool limits.
 */
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

export function isSupabaseRestEnabled(): boolean {
  return supabaseCreds() !== null;
}

/** Build a PostgREST query string from key/value pairs (skips undefined/null). */
export function supabaseQuery(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    parts.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}

/** Raw Response — use when you need status/headers or empty representation checks. */
export async function supabaseRestRaw(
  path: string,
  init: RequestInit & { prefer?: string } = {}
): Promise<Response> {
  const creds = supabaseCreds();
  if (!creds) {
    throw new Error("Supabase REST is not configured");
  }
  const headers = new Headers(init.headers);
  headers.set("apikey", creds.key);
  headers.set("Authorization", `Bearer ${creds.key}`);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.prefer) headers.set("Prefer", init.prefer);

  return fetch(`${creds.url}/rest/v1/${path.replace(/^\//, "")}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function supabaseRest<T = unknown>(
  path: string,
  init: RequestInit & { prefer?: string } = {}
): Promise<T> {
  const res = await supabaseRestRaw(path, init);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase REST ${res.status}: ${body || res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
