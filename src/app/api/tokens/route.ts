import { requireSession } from "@/lib/auth/session";
import { tokenService } from "@/lib/services/tokenService";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET() {
  try {
    await requireSession(["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"]);
    const tokens = await tokenService.getTodayTokens();
    return jsonOk(tokens);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession([
      "ADMIN",
      "TOKEN_OFFICER",
      "QUEUE_OFFICER",
    ]);
    const body = await request.json();
    const token = await tokenService.issueToken(body, session.userId);
    return jsonOk(token);
  } catch (error) {
    return jsonError(error, "Failed to issue token");
  }
}
