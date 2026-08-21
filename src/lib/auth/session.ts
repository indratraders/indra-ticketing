import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SafeUser, SessionPayload, UserRole } from "@/types";

const SESSION_COOKIE = "indra_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 hours
const VALID_ROLES: UserRole[] = ["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"];

function getSecret(): Uint8Array {
  const secret =
    process.env.NEXTAUTH_SECRET ||
    "indra-traders-demo-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

function normalizeRole(value: unknown): UserRole | null {
  const role = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : null;
}

export async function createSessionToken(user: SafeUser): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  return new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = normalizeRole(payload.role);
    const userId = String(payload.userId ?? "").trim();
    if (!userId || !role) return null;
    return {
      userId,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role,
      exp: Number(payload.exp ?? 0),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // LAN HTTP deploys must set COOKIE_SECURE=false or the browser will drop the session.
    secure:
      process.env.COOKIE_SECURE === "true"
        ? true
        : process.env.COOKIE_SECURE === "false"
          ? false
          : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(
  allowedRoles?: UserRole[]
): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Authentication required", 401);
  }

  // Prefer live role from DB so SQL Server users stay in sync
  let role = session.role;
  try {
    const { userRepository } = await import("@/lib/repositories");
    const user = await userRepository.findById(session.userId);
    if (!user || !user.active) {
      throw new AuthError("Authentication required", 401);
    }
    const dbRole = normalizeRole(user.role);
    if (!dbRole) {
      throw new AuthError("Insufficient permissions", 403);
    }
    role = dbRole;
    session.role = dbRole;
    session.name = user.name;
    session.email = user.email;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    // If DB lookup fails, fall back to JWT role
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new AuthError(
      `Insufficient permissions. This action needs ${allowedRoles.join(" or ")}. You are signed in as ${role}.`,
      403
    );
  }
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

export const ROLE_HOME: Record<UserRole, string> = {
  ADMIN: "/admin",
  TOKEN_OFFICER: "/tokens",
  QUEUE_OFFICER: "/queue",
};

export function canAccessPath(role: UserRole, path: string): boolean {
  if (path.startsWith("/display")) return true;
  if (role === "ADMIN") return true;

  // Floor officers share token + queue access (same login on multiple devices)
  if (role === "TOKEN_OFFICER" || role === "QUEUE_OFFICER") {
    return (
      path.startsWith("/tokens") ||
      path.startsWith("/queue") ||
      path.startsWith("/history") ||
      path.startsWith("/reports") ||
      path.startsWith("/display") ||
      path === "/" ||
      path.startsWith("/api/tokens") ||
      path.startsWith("/api/queue") ||
      path.startsWith("/api/stats") ||
      path.startsWith("/api/history") ||
      path.startsWith("/api/reports") ||
      path.startsWith("/api/vehicles") ||
      path.startsWith("/api/realtime") ||
      path.startsWith("/api/auth") ||
      path.startsWith("/api/settings")
    );
  }

  return false;
}
