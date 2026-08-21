import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function jsonError(error: unknown, fallback = "Something went wrong") {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  const message = error instanceof Error ? error.message : fallback;
  // Never expose raw SQL / stack traces
  const safe =
    message.includes("SQL") || message.includes("Prisma")
      ? fallback
      : message;
  return NextResponse.json({ success: false, error: safe }, { status: 400 });
}
