import type { UserRole } from "@/types";

/** Client-safe role home map (no server-only imports) */
export const ROLE_HOME: Record<UserRole, string> = {
  ADMIN: "/admin",
  TOKEN_OFFICER: "/tokens",
  QUEUE_OFFICER: "/queue",
};
