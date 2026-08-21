import { requireSession } from "@/lib/auth/session";
import { resetDemoStore } from "@/lib/db/demo-store";
import { userRepository } from "@/lib/repositories";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET() {
  try {
    await requireSession(["ADMIN"]);
    return jsonOk(await userRepository.list());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSession(["ADMIN"]);
    const body = await request.json();
    if (body.action === "RESET_DEMO") {
      resetDemoStore();
      return jsonOk({ reset: true });
    }
    throw new Error("Unknown action");
  } catch (error) {
    return jsonError(error);
  }
}
