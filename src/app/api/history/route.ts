import { requireSession } from "@/lib/auth/session";
import { tokenService } from "@/lib/services/tokenService";
import { jsonError, jsonOk } from "@/lib/utils/api";
import type { TokenStatus } from "@/types";

export async function GET(request: Request) {
  try {
    await requireSession(["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"]);
    const { searchParams } = new URL(request.url);
    const result = await tokenService.getHistory({
      businessDate: searchParams.get("date") || undefined,
      status: (searchParams.get("status") as TokenStatus) || undefined,
      search: searchParams.get("search") || undefined,
      vehicleId: searchParams.get("vehicleId") || undefined,
      officerId: searchParams.get("officerId") || undefined,
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
