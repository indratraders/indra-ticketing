import { authService } from "@/lib/auth/authService";
import { jsonOk } from "@/lib/utils/api";

export async function POST() {
  await authService.logout();
  return jsonOk({ ok: true });
}
