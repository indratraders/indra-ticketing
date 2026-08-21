import { getSession, requireSession } from "@/lib/auth/session";
import { settingsService } from "@/lib/services/settingsService";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET() {
  try {
    // Settings needed by display (public-safe subset later); for now allow read
    const session = await getSession();
    const settings = await settingsService.get();
    const counters = await settingsService.listCounters();
    if (!session) {
      return jsonOk({
        companyName: settings.companyName,
        audioNotificationEnabled: settings.audioNotificationEnabled,
        textToSpeechEnabled: settings.textToSpeechEnabled,
        displayMode: settings.displayMode,
        upcomingTokensCount: settings.upcomingTokensCount,
        displayShowCustomerName: settings.displayShowCustomerName,
        defaultCounterId: settings.defaultCounterId,
        counters,
      });
    }
    return jsonOk({ ...settings, counters });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireSession(["ADMIN"]);
    const body = await request.json();
    const updated = await settingsService.update(body);
    return jsonOk(updated);
  } catch (error) {
    return jsonError(error);
  }
}
