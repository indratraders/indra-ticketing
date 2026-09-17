/** User-facing database connectivity errors (hide raw DNS / pooler noise). */

export function isDbConnectivityError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("tenant/user") ||
    lower.includes("getaddrinfo") ||
    lower.includes("could not resolve") ||
    lower.includes("supabase rest") ||
    (lower.includes("postgres") && lower.includes("not found"))
  );
}

export function friendlyDbError(error: unknown): string {
  if (!isDbConnectivityError(error)) {
    return error instanceof Error ? error.message : "Database error";
  }
  return (
    "Database unreachable. The Supabase project may be paused or deleted, " +
    "or SUPABASE_URL / POSTGRES_URL on Vercel is wrong. " +
    "Create or restore the project, update env vars, run scripts/setup-supabase.sql, then redeploy."
  );
}
