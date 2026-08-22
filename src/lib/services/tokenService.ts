import { broadcastRealtime } from "@/lib/db/demo-store";
import {
  customerRepository,
  settingsRepository,
  tokenRepository,
  vehicleRepository,
} from "@/lib/repositories";
import { DEFAULT_MAX_CONCURRENT_ACTIVE } from "@/lib/constants";
import { sanitizeString } from "@/lib/utils";
import { average, getBusinessDate, minutesBetween, nowISO } from "@/lib/utils/date";
import { issueTokenSchema } from "@/lib/validation/schemas";
import type {
  DashboardStats,
  IssueTokenInput,
  QueueSnapshot,
  ReportSummary,
  TokenStatus,
  TokenWithRelations,
} from "@/types";

function notifyQueueUpdated(extra?: Record<string, unknown>) {
  broadcastRealtime({
    type: "QUEUE_UPDATED",
    payload: { ...extra, version: tokenRepository.getStoreVersion() },
    timestamp: nowISO(),
  });
}

function notifyRecall(token: TokenWithRelations) {
  broadcastRealtime({
    type: "TOKEN_RECALLED",
    payload: {
      tokenId: token.id,
      tokenNumber: token.tokenNumber,
      recallVersion: tokenRepository.getRecallVersion(),
    },
    timestamp: nowISO(),
  });
}

async function resolveMaxConcurrent(): Promise<number> {
  const vehicles = await vehicleRepository.list(true);
  // Only Colombo fleet slots count — ignore ad-hoc "Other" typed vehicles
  const fleet = vehicles.filter((v) => v.brand.toLowerCase() !== "other");
  return Math.max(1, fleet.length || DEFAULT_MAX_CONCURRENT_ACTIVE);
}

export const tokenService = {
  async issueToken(input: IssueTokenInput, issuedBy: string) {
    const parsed = issueTokenSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid token data");
    }

    const data = parsed.data;
    const customName = (data.customVehicleName ?? "").trim();
    const rawVehicleId = (data.vehicleId ?? "").trim();

    let vehicle;
    if (rawVehicleId === "__other__" || (!rawVehicleId && customName)) {
      if (customName.length < 2) {
        throw new Error("Type the vehicle name");
      }
      vehicle = await vehicleRepository.findOrCreateCustom(customName);
    } else if (!rawVehicleId) {
      vehicle = await vehicleRepository.findOrCreateUnspecified();
    } else {
      vehicle = await vehicleRepository.findById(rawVehicleId);
    }

    if (!vehicle || !vehicle.active) {
      throw new Error("Selected vehicle is not available");
    }
    if (vehicle.status === "MAINTENANCE" || vehicle.status === "UNAVAILABLE") {
      throw new Error("Vehicle is currently unavailable for test drives");
    }

    const customer = await customerRepository.findOrCreate({
      name: sanitizeString(data.customerName),
      contactNumber: sanitizeString(data.contactNumber),
      nic: data.nic ? sanitizeString(data.nic) : null,
      email: data.email ? sanitizeString(data.email) : null,
    });

    const token = await tokenRepository.createToken({
      customerId: customer.id,
      vehicleId: vehicle.id,
      testDriveType: data.testDriveType,
      notes: data.notes ? sanitizeString(data.notes) : null,
      counterId: data.counterId,
      issuedBy,
    });

    notifyQueueUpdated({ action: "ISSUED", tokenId: token.id });
    return token;
  },

  async getTodayTokens(): Promise<TokenWithRelations[]> {
    return tokenRepository.listByBusinessDate();
  },

  async getQueueSnapshot(counterId?: string | null): Promise<QueueSnapshot> {
    const settings = await settingsRepository.get();
    const maxConcurrentActive = await resolveMaxConcurrent();
    // One fetch for today — filter in memory (much faster on Vercel/Supabase)
    const today = await tokenRepository.listByBusinessDate();
    const activeTokens = today.filter(
      (t) => t.status === "CALLED" || t.status === "IN_PROGRESS"
    );
    const waitingTokens = today.filter((t) => t.status === "WAITING");
    const completedTokens = today
      .filter((t) => t.status === "COMPLETED")
      .slice()
      .reverse();
    const skippedTokens = today.filter((t) => t.status === "SKIPPED");
    const cancelledTokens = today.filter((t) => t.status === "CANCELLED");
    const currentToken = activeTokens[0] ?? null;
    const previousToken =
      today
        .filter(
          (t) =>
            t.id !== currentToken?.id &&
            (t.status === "COMPLETED" ||
              t.status === "CALLED" ||
              t.status === "IN_PROGRESS")
        )
        .sort((a, b) => {
          const aTime = a.calledAt || a.completedAt || a.issuedAt;
          const bTime = b.calledAt || b.completedAt || b.issuedAt;
          return bTime.localeCompare(aTime);
        })[0] ?? null;
    const upcomingTokens = waitingTokens.slice(0, settings.upcomingTokensCount);

    return {
      currentToken,
      activeTokens,
      waitingTokens,
      completedTokens,
      skippedTokens,
      cancelledTokens,
      previousToken,
      upcomingTokens,
      waitingCount: waitingTokens.length,
      activeCount: activeTokens.length,
      maxConcurrentActive,
      recallVersion: tokenRepository.getRecallVersion(),
      version: tokenRepository.getStoreVersion(),
      updatedAt: nowISO(),
    };
  },

  async callNext(
    performedBy: string,
    counterId?: string,
    tokenId?: string | null
  ) {
    const settings = await settingsRepository.get();
    const maxConcurrent = await resolveMaxConcurrent();
    const token = await tokenRepository.callNext({
      performedBy,
      counterId: counterId ?? settings.defaultCounterId,
      autoComplete: settings.autoCompleteOnNext,
      maxConcurrent,
      tokenId,
    });
    notifyQueueUpdated({ action: "CALLED", tokenId: token.id });
    notifyRecall(token);
    return token;
  },

  async complete(tokenId: string, performedBy: string) {
    const token = await tokenRepository.complete(tokenId, performedBy);
    notifyQueueUpdated({ action: "COMPLETED", tokenId: token.id });
    return token;
  },

  async recall(tokenId: string, performedBy: string) {
    const token = await tokenRepository.recall(tokenId, performedBy);
    notifyQueueUpdated({ action: "RECALLED", tokenId: token.id });
    notifyRecall(token);
    return token;
  },

  async skip(tokenId: string, performedBy: string, reason?: string) {
    const token = await tokenRepository.skip({
      tokenId,
      performedBy,
      reason: reason ? sanitizeString(reason) : undefined,
    });
    notifyQueueUpdated({ action: "SKIPPED", tokenId: token.id });
    return token;
  },

  async cancel(tokenId: string, performedBy: string, reason?: string) {
    const token = await tokenRepository.cancel({
      tokenId,
      performedBy,
      reason: reason ? sanitizeString(reason) : undefined,
    });
    notifyQueueUpdated({ action: "CANCELLED", tokenId: token.id });
    return token;
  },

  async getStats(businessDate?: string): Promise<DashboardStats> {
    const date = businessDate ?? getBusinessDate();
    const tokens = await tokenRepository.listByBusinessDate(date);

    const count = (status: TokenStatus) =>
      tokens.filter((t) => t.status === status).length;

    const waitingTimes = tokens
      .map((t) => minutesBetween(t.issuedAt, t.calledAt))
      .filter((v): v is number => v !== null);

    const driveTimes = tokens
      .map((t) => minutesBetween(t.startedAt ?? t.calledAt, t.completedAt))
      .filter((v): v is number => v !== null);

    return {
      issued: tokens.length,
      waiting: count("WAITING"),
      inProgress: count("CALLED") + count("IN_PROGRESS"),
      completed: count("COMPLETED"),
      skipped: count("SKIPPED"),
      cancelled: count("CANCELLED"),
      averageWaitingMinutes: average(waitingTimes),
      averageTestDriveMinutes: average(driveTimes),
    };
  },

  async getHistory(
    filters: Parameters<typeof tokenRepository.listHistory>[0]
  ) {
    return tokenRepository.listHistory(filters);
  },

  async getReport(days = 7): Promise<ReportSummary> {
    const all = await tokenRepository.getAllTokens();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const cutoffDate = getBusinessDate(cutoff);

    const recent = all.filter((t) => t.businessDate >= cutoffDate);
    const enriched = (
      await Promise.all(
        recent.map((t) => tokenRepository.findEnrichedById(t.id))
      )
    ).filter((t): t is TokenWithRelations => Boolean(t));

    const dailyMap = new Map<string, number>();
    const vehicleMap = new Map<string, number>();
    const hourMap = new Map<string, number>();
    const statusMap = new Map<TokenStatus, number>();
    const officerMap = new Map<string, { issued: number; called: number }>();

    for (const token of enriched) {
      dailyMap.set(
        token.businessDate,
        (dailyMap.get(token.businessDate) ?? 0) + 1
      );

      const vehicleName = `${token.vehicle.brand} ${token.vehicle.model}`;
      vehicleMap.set(vehicleName, (vehicleMap.get(vehicleName) ?? 0) + 1);

      const hour = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        hour: "2-digit",
        hour12: false,
      }).format(new Date(token.issuedAt));
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);

      statusMap.set(token.status, (statusMap.get(token.status) ?? 0) + 1);

      const issuer = token.issuer?.name ?? "Unknown";
      const issuerStats = officerMap.get(issuer) ?? { issued: 0, called: 0 };
      issuerStats.issued += 1;
      officerMap.set(issuer, issuerStats);

      if (token.caller) {
        const callerStats = officerMap.get(token.caller.name) ?? {
          issued: 0,
          called: 0,
        };
        callerStats.called += 1;
        officerMap.set(token.caller.name, callerStats);
      }
    }

    const waitingTimes = enriched
      .map((t) => minutesBetween(t.issuedAt, t.calledAt))
      .filter((v): v is number => v !== null);
    const driveTimes = enriched
      .map((t) => minutesBetween(t.startedAt ?? t.calledAt, t.completedAt))
      .filter((v): v is number => v !== null);

    return {
      dailyTokenCount: [...dailyMap.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      vehicleWise: [...vehicleMap.entries()]
        .map(([vehicle, count]) => ({ vehicle, count }))
        .sort((a, b) => b.count - a.count),
      hourlyVolume: [...hourMap.entries()]
        .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
      statusBreakdown: [...statusMap.entries()].map(([status, count]) => ({
        status,
        count,
      })),
      officerActivity: [...officerMap.entries()].map(([officer, stats]) => ({
        officer,
        ...stats,
      })),
      averageWaitingMinutes: average(waitingTimes),
      averageTestDriveMinutes: average(driveTimes),
      completed: statusMap.get("COMPLETED") ?? 0,
      cancelled: statusMap.get("CANCELLED") ?? 0,
    };
  },
};
