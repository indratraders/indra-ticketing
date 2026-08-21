import { requireSession } from "@/lib/auth/session";
import { settingsRepository } from "@/lib/repositories";
import { tokenService } from "@/lib/services/tokenService";
import { jsonError, jsonOk } from "@/lib/utils/api";

export async function GET(request: Request) {
  try {
    // Public display can read queue snapshot without auth
    const { searchParams } = new URL(request.url);
    const counterParam = searchParams.get("counter");
    let counterId: string | undefined;
    if (counterParam) {
      const counter = await settingsRepository.findCounterByCode(counterParam);
      counterId = counter?.id;
    }
    const snapshot = await tokenService.getQueueSnapshot(counterId);
    return jsonOk(snapshot);
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
    const action = body.action as string;

    switch (action) {
      case "NEXT": {
        const token = await tokenService.callNext(
          session.userId,
          body.counterId,
          body.tokenId
        );
        return jsonOk(token);
      }
      case "COMPLETE": {
        const token = await tokenService.complete(body.tokenId, session.userId);
        return jsonOk(token);
      }
      case "RECALL": {
        const token = await tokenService.recall(body.tokenId, session.userId);
        return jsonOk(token);
      }
      case "SKIP": {
        const token = await tokenService.skip(
          body.tokenId,
          session.userId,
          body.reason
        );
        return jsonOk(token);
      }
      case "CANCEL": {
        const token = await tokenService.cancel(
          body.tokenId,
          session.userId,
          body.reason
        );
        return jsonOk(token);
      }
      default:
        throw new Error("Unknown queue action");
    }
  } catch (error) {
    return jsonError(error, "Queue action failed");
  }
}
