import { requireSession } from "@/lib/auth/session";
import { tokenService } from "@/lib/services/tokenService";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET() {
  try {
    await requireSession(["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"]);
    return jsonOk(await tokenService.getStats());
  } catch (error) {
    return jsonError(error);
  }
}
