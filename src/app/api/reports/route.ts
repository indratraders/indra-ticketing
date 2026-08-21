import { requireSession } from "@/lib/auth/session";
import { tokenService } from "@/lib/services/tokenService";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET(request: Request) {
  try {
    await requireSession([
      "ADMIN",
      "TOKEN_OFFICER",
      "QUEUE_OFFICER",
    ]);
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") || 7);
    return jsonOk(await tokenService.getReport(days));
  } catch (error) {
    return jsonError(error);
  }
}
