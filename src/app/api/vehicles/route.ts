import { getSession, requireSession } from "@/lib/auth/session";
import { vehicleService } from "@/lib/services/settingsService";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const available = searchParams.get("available") === "true";
    const session = await getSession();
    if (!session) {
      // Allow authenticated token issue form; public shouldn't list all
      return jsonError(new Error("Authentication required"));
    }
    const vehicles = available
      ? await vehicleService.listAvailable()
      : await vehicleService.list();
    return jsonOk(vehicles);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSession(["ADMIN"]);
    const body = await request.json();
    const vehicle = await vehicleService.create(body);
    return jsonOk(vehicle);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireSession(["ADMIN"]);
    const body = await request.json();
    const vehicle = await vehicleService.update(body.id, body);
    return jsonOk(vehicle);
  } catch (error) {
    return jsonError(error);
  }
}
