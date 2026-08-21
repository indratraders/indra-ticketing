import { getSession, requireSession } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET() {
  try {
    // Prefer live role from DB when authenticated; fall back to cookie-only
    try {
      const session = await requireSession();
      return jsonOk({ user: session });
    } catch {
      const session = await getSession();
      return jsonOk({ user: session });
    }
  } catch (error) {
    return jsonError(error);
  }
}
