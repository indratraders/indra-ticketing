import { authService } from "@/lib/auth/authService";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await authService.login(body.email, body.password);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, "Login failed");
  }
}
