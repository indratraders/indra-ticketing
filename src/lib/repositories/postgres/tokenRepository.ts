import {
  broadcastRealtime,
  bumpStoreVersion,
  createEntityId,
  getStore,
} from "@/lib/db/demo-store";
import { supabaseRest } from "@/lib/db/supabase-rest";
import { formatCustomerCode, formatDisplayToken } from "@/lib/utils";
import { getBusinessDate, nowISO } from "@/lib/utils/date";
import type {
  Token,
  TokenEvent,
  TokenEventType,
  TokenStatus,
  TokenWithRelations,
} from "@/types";
import {
  mapCounter,
  mapCustomer,
  mapSafeUser,
  mapToken,
  mapTokenEvent,
  mapVehicle,
} from "../mssql/mappers";

const SETTINGS_ID = "settings_default";

const LIST_CACHE_TTL_MS = 2000;
let listByDateCache: {
  date: string;
  at: number;
  items: TokenWithRelations[];
} | null = null;

function notifyMutation(extra?: Record<string, unknown>) {
  listByDateCache = null;
  bumpStoreVersion();
  broadcastRealtime({
    type: "QUEUE_UPDATED",
    payload: { ...extra, version: getStore().version },
    timestamp: nowISO(),
  });
}

/** Demo-compatible mutex wrapper for callers that use withTransaction */
async function withTransaction<T>(fn: () => T | Promise<T>): Promise<T> {
  return fn();
}

function nextQueueNumber(
  last: number,
  startingTokenNumber: number,
  maxTokenNumber: number,
  inUse: Set<number> = new Set()
): number {
  const start = Math.max(1, startingTokenNumber || 1);
  const max = Math.max(start, maxTokenNumber || 50);
  let candidate = last;
  const span = max - start + 1;
  for (let i = 0; i < span; i++) {
    candidate = candidate < start || candidate >= max ? start : candidate + 1;
    if (!inUse.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "All token numbers in the current cycle are already in use. Complete or cancel a drive first."
  );
}

function eq(id: string): string {
  return encodeURIComponent(id);
}

async function enrichRows(
  rows: Record<string, unknown>[]
): Promise<TokenWithRelations[]> {
  if (!rows.length) return [];

  const tokens = rows.map(mapToken);
  const customerIds = [...new Set(tokens.map((t) => t.customerId))];
  const vehicleIds = [...new Set(tokens.map((t) => t.vehicleId))];
  const counterIds = [
    ...new Set(tokens.map((t) => t.counterId).filter(Boolean) as string[]),
  ];
  const userIds = [
    ...new Set(
      tokens.flatMap((t) =>
        [t.issuedBy, t.calledBy].filter(Boolean) as string[]
      )
    ),
  ];

  const inList = (ids: string[]) => ids.map(eq).join(",");

  const [customers, vehicles, counters, users] = await Promise.all([
    customerIds.length
      ? supabaseRest<Record<string, unknown>[]>(
          `customers?id=in.(${inList(customerIds)})&select=*`
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    vehicleIds.length
      ? supabaseRest<Record<string, unknown>[]>(
          `vehicles?id=in.(${inList(vehicleIds)})&select=*`
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    counterIds.length
      ? supabaseRest<Record<string, unknown>[]>(
          `counters?id=in.(${inList(counterIds)})&select=*`
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    userIds.length
      ? supabaseRest<Record<string, unknown>[]>(
          `users?id=in.(${inList(userIds)})&select=id,email,name,role,active`
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const customerMap = new Map(
    (customers || []).map((c) => [String(c.id), mapCustomer(c)])
  );
  const vehicleMap = new Map(
    (vehicles || []).map((v) => [String(v.id), mapVehicle(v)])
  );
  const counterMap = new Map(
    (counters || []).map((c) => [String(c.id), mapCounter(c)])
  );
  const userMap = new Map(
    (users || []).map((u) => [String(u.id), mapSafeUser(u)])
  );

  const out: TokenWithRelations[] = [];
  for (const token of tokens) {
    const customer = customerMap.get(token.customerId);
    const vehicle = vehicleMap.get(token.vehicleId);
    if (!customer || !vehicle) continue;
    out.push({
      ...token,
      customer,
      vehicle,
      counter: token.counterId ? counterMap.get(token.counterId) ?? null : null,
      issuer: userMap.get(token.issuedBy) ?? null,
      caller: token.calledBy ? userMap.get(token.calledBy) ?? null : null,
    });
  }
  return out;
}

async function enrichById(tokenId: string): Promise<TokenWithRelations | null> {
  const rows = await supabaseRest<Record<string, unknown>[]>(
    `tokens?id=eq.${eq(tokenId)}&select=*&limit=1`
  );
  if (!rows?.[0]) return null;
  const [enriched] = await enrichRows(rows);
  return enriched ?? null;
}

async function listEnriched(query: string): Promise<TokenWithRelations[]> {
  // Plain select — avoids a failed embed round-trip that doubled latency
  const rows = await supabaseRest<Record<string, unknown>[]>(
    `tokens?${query}&select=*`
  );
  return enrichRows(rows || []);
}

async function insertEvent(input: {
  tokenId: string;
  eventType: TokenEventType;
  fromStatus: TokenStatus | null;
  toStatus: TokenStatus | null;
  performedBy: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await supabaseRest("token_events", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      id: createEntityId("evt"),
      tokenId: input.tokenId,
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      performedBy: input.performedBy,
      reason: input.reason ?? null,
      metadata: input.metadata ?? null,
      createdAt: nowISO(),
    }),
  });
}

async function releaseVehicleIfActive(
  vehicleId: string,
  fromStatus: TokenStatus
) {
  if (fromStatus !== "CALLED" && fromStatus !== "IN_PROGRESS") return;
  await supabaseRest(
    `vehicles?id=eq.${eq(vehicleId)}&status=eq.IN_TEST_DRIVE`,
    {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        status: "AVAILABLE",
        updatedAt: nowISO(),
      }),
    }
  );
}

async function completeTokenInTx(
  tokenId: string,
  performedBy: string
): Promise<Token> {
  const rows = await supabaseRest<Record<string, unknown>[]>(
    `tokens?id=eq.${eq(tokenId)}&select=*&limit=1`
  );
  const row = rows?.[0];
  if (!row) throw new Error("Token not found");
  const token = mapToken(row);
  if (token.status !== "CALLED" && token.status !== "IN_PROGRESS") {
    throw new Error("Only an active token can be completed");
  }

  const now = nowISO();
  await supabaseRest(`tokens?id=eq.${eq(tokenId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      status: "COMPLETED",
      completedAt: now,
      updatedAt: now,
    }),
  });

  await supabaseRest(
    `vehicles?id=eq.${eq(token.vehicleId)}&status=eq.IN_TEST_DRIVE`,
    {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        status: "AVAILABLE",
        updatedAt: now,
      }),
    }
  );

  await insertEvent({
    tokenId,
    eventType: "COMPLETED",
    fromStatus: token.status,
    toStatus: "COMPLETED",
    performedBy,
  });

  return {
    ...token,
    status: "COMPLETED",
    completedAt: now,
    updatedAt: now,
  };
}

export const tokenRepository = {
  withTransaction,

  async findById(id: string): Promise<Token | null> {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?id=eq.${eq(id)}&select=*&limit=1`
    );
    return rows?.[0] ? mapToken(rows[0]) : null;
  },

  async findEnrichedById(id: string): Promise<TokenWithRelations | null> {
    return enrichById(id);
  },

  async listByBusinessDate(
    businessDate?: string
  ): Promise<TokenWithRelations[]> {
    const date = businessDate ?? getBusinessDate();
    const today = getBusinessDate();
    if (
      date === today &&
      listByDateCache &&
      listByDateCache.date === date &&
      Date.now() - listByDateCache.at < LIST_CACHE_TTL_MS
    ) {
      return listByDateCache.items;
    }

    const items = await listEnriched(
      `businessDate=eq.${eq(date)}&order=issuedAt.asc`
    );

    if (date === today) {
      listByDateCache = { date, at: Date.now(), items };
    }
    return items;
  },

  async listByStatus(
    status: TokenStatus | TokenStatus[],
    businessDate?: string
  ): Promise<TokenWithRelations[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const date = businessDate ?? getBusinessDate();
    const statusFilter =
      statuses.length === 1
        ? `status=eq.${statuses[0]}`
        : `status=in.(${statuses.join(",")})`;
    return listEnriched(
      `businessDate=eq.${eq(date)}&${statusFilter}&order=sequenceNumber.asc,issuedAt.asc`
    );
  },

  async getActiveToken(
    counterId?: string | null
  ): Promise<TokenWithRelations | null> {
    const active = await this.listActiveTokens(counterId);
    return active[0] ?? null;
  },

  async listActiveTokens(
    counterId?: string | null
  ): Promise<TokenWithRelations[]> {
    const date = getBusinessDate();
    let query = `businessDate=eq.${eq(date)}&status=in.(CALLED,IN_PROGRESS)&order=calledAt.asc,issuedAt.asc`;
    if (counterId) {
      query += `&counterId=eq.${eq(counterId)}`;
    }
    return listEnriched(query);
  },

  async listAllActiveTokens(): Promise<TokenWithRelations[]> {
    return this.listActiveTokens(null);
  },

  async getOldestWaiting(
    counterId?: string | null
  ): Promise<TokenWithRelations | null> {
    const waiting = await this.listByStatus("WAITING");
    const filtered = waiting.filter(
      (t) => !counterId || !t.counterId || t.counterId === counterId
    );
    return filtered[0] ?? null;
  },

  async getPreviousCompletedOrActive(
    currentId?: string | null
  ): Promise<TokenWithRelations | null> {
    const date = getBusinessDate();
    let query = `businessDate=eq.${eq(date)}&status=in.(COMPLETED,CALLED,IN_PROGRESS)`;
    if (currentId) {
      query += `&id=neq.${eq(currentId)}`;
    }
    const items = await listEnriched(query);
    items.sort((a, b) => {
      const aKey = a.calledAt || a.completedAt || a.issuedAt;
      const bKey = b.calledAt || b.completedAt || b.issuedAt;
      return bKey.localeCompare(aKey);
    });
    return items[0] ?? null;
  },

  async listHistory(filters: {
    businessDate?: string;
    status?: TokenStatus;
    search?: string;
    vehicleId?: string;
    officerId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: TokenWithRelations[]; total: number }> {
    const parts: string[] = ["order=issuedAt.desc", "limit=500"];
    if (filters.businessDate) {
      parts.push(`businessDate=eq.${eq(filters.businessDate)}`);
    }
    if (filters.status) {
      parts.push(`status=eq.${filters.status}`);
    }
    if (filters.vehicleId) {
      parts.push(`vehicleId=eq.${eq(filters.vehicleId)}`);
    }

    let items = await listEnriched(parts.join("&"));

    if (filters.officerId) {
      const oid = filters.officerId;
      items = items.filter((t) => t.issuedBy === oid || t.calledBy === oid);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter((t) => {
        const vehicleLabel = `${t.vehicle.brand} ${t.vehicle.model}`.toLowerCase();
        return (
          t.tokenNumber.toLowerCase().includes(q) ||
          t.customerCode.toLowerCase().includes(q) ||
          t.customer.name.toLowerCase().includes(q) ||
          t.customer.contactNumber.toLowerCase().includes(q) ||
          vehicleLabel.includes(q)
        );
      });
    }

    const total = items.length;
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    return {
      items: items.slice(offset, offset + pageSize),
      total,
    };
  },

  async listEvents(tokenId: string): Promise<TokenEvent[]> {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `token_events?tokenId=eq.${eq(tokenId)}&select=*&order=createdAt.asc`
    );
    return (rows || []).map(mapTokenEvent);
  },

  async createToken(input: {
    customerId: string;
    vehicleId: string;
    testDriveType: Token["testDriveType"];
    notes?: string | null;
    counterId?: string | null;
    issuedBy: string;
  }): Promise<TokenWithRelations> {
    const businessDate = getBusinessDate();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const settingsRows = await supabaseRest<Record<string, unknown>[]>(
          `settings?id=eq.${eq(SETTINGS_ID)}&select=*&limit=1`
        );
        const settingsRow = settingsRows?.[0];
        if (!settingsRow) {
          throw new Error("System settings not found. Run db:seed.");
        }

        const start = Number(settingsRow.startingTokenNumber) || 1;
        const max = Number(settingsRow.maxTokenNumber) || 50;
        const lastQueue = Number(settingsRow.lastQueueSequence) || 0;
        const lastCustomerCode =
          Number(settingsRow.lastCustomerCodeSequence) || 0;
        const prefix = String(settingsRow.customerCodePrefix || "C");
        const defaultCounterId = String(settingsRow.defaultCounterId);

        const inUseRows = await supabaseRest<{ sequenceNumber: number }[]>(
          `tokens?businessDate=eq.${eq(businessDate)}&status=in.(WAITING,CALLED,IN_PROGRESS)&select=sequenceNumber`
        );
        const inUse = new Set<number>(
          (inUseRows || []).map((r) => Number(r.sequenceNumber))
        );

        const nextSequence = nextQueueNumber(lastQueue, start, max, inUse);
        const nextCustomerSeq = lastCustomerCode + 1;
        const tokenNumber = formatDisplayToken(nextSequence);
        const customerCode = formatCustomerCode(prefix, nextCustomerSeq);
        const counterId = input.counterId ?? defaultCounterId;
        const now = nowISO();
        const id = createEntityId("tok");

        const patched = await supabaseRest<Record<string, unknown>[]>(
          `settings?id=eq.${eq(SETTINGS_ID)}&lastQueueSequence=eq.${lastQueue}`,
          {
            method: "PATCH",
            prefer: "return=representation",
            body: JSON.stringify({
              lastQueueSequence: nextSequence,
              lastCustomerCodeSequence: nextCustomerSeq,
              updatedAt: now,
            }),
          }
        );
        if (!patched || patched.length === 0) {
          lastError = new Error("Settings sequence conflict");
          continue;
        }

        await supabaseRest("tokens", {
          method: "POST",
          prefer: "return=minimal",
          body: JSON.stringify({
            id,
            tokenNumber,
            tokenPrefix: "",
            sequenceNumber: nextSequence,
            customerCode,
            businessDate,
            customerId: input.customerId,
            vehicleId: input.vehicleId,
            testDriveType: input.testDriveType,
            status: "WAITING",
            counterId,
            issuedBy: input.issuedBy,
            calledBy: null,
            notes: input.notes ?? null,
            skipReason: null,
            cancellationReason: null,
            cancelledBy: null,
            issuedAt: now,
            calledAt: null,
            startedAt: null,
            completedAt: null,
            skippedAt: null,
            cancelledAt: null,
            recallCount: 0,
            lastRecalledAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        });

        await insertEvent({
          tokenId: id,
          eventType: "ISSUED",
          fromStatus: null,
          toStatus: "WAITING",
          performedBy: input.issuedBy,
          metadata: {
            tokenNumber,
            customerCode,
            cycle: `${start}-${max}`,
          },
        });

        notifyMutation({ action: "ISSUED", tokenId: id });
        const enriched = await enrichById(id);
        if (!enriched) throw new Error("Token relations missing");
        return enriched;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (
          lastError.message.includes("All token numbers") ||
          lastError.message.includes("System settings not found")
        ) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Failed to create token after retries");
  },

  async callNext(input: {
    performedBy: string;
    counterId?: string | null;
    autoComplete: boolean;
    maxConcurrent: number;
    tokenId?: string | null;
  }): Promise<TokenWithRelations> {
    const settingsRows = await supabaseRest<Record<string, unknown>[]>(
      `settings?id=eq.${eq(SETTINGS_ID)}&select=defaultCounterId&limit=1`
    );
    const defaultCounterId = String(
      settingsRows?.[0]?.defaultCounterId ?? ""
    );
    const counterId = input.counterId ?? defaultCounterId;
    const businessDate = getBusinessDate();
    const maxConcurrent = Math.max(1, input.maxConcurrent || 6);

    let activeRows = await supabaseRest<
      { id: string; vehicleId: string; status: TokenStatus }[]
    >(
      `tokens?businessDate=eq.${eq(businessDate)}&status=in.(CALLED,IN_PROGRESS)&select=id,vehicleId,status&order=calledAt.asc,issuedAt.asc`
    );
    activeRows = activeRows || [];

    if (activeRows.length >= maxConcurrent) {
      if (!input.autoComplete) {
        throw new Error(
          `All ${maxConcurrent} test drive slots are full. Complete a drive before calling the next customer.`
        );
      }
      await completeTokenInTx(activeRows[0].id, input.performedBy);
      activeRows = activeRows.slice(1);
    }

    const busyVehicleIds = new Set(
      activeRows
        .filter((r) => r.vehicleId !== "veh_unspecified")
        .map((r) => r.vehicleId)
    );

    let next: { id: string; status: TokenStatus; vehicleId: string } | undefined;

    if (input.tokenId) {
      const specificRows = await supabaseRest<
        { id: string; status: TokenStatus; vehicleId: string }[]
      >(`tokens?id=eq.${eq(input.tokenId)}&select=id,status,vehicleId&limit=1`);
      const specific = specificRows?.[0];
      if (!specific || specific.status !== "WAITING") {
        throw new Error("Selected token is not waiting");
      }
      if (busyVehicleIds.has(specific.vehicleId)) {
        throw new Error(
          "That vehicle is already on a test drive. Complete it before calling this token."
        );
      }
      next = specific;
    } else {
      const waiting = await supabaseRest<
        {
          id: string;
          status: TokenStatus;
          vehicleId: string;
          sequenceNumber: number;
        }[]
      >(
        `tokens?businessDate=eq.${eq(businessDate)}&status=eq.WAITING&or=(counterId.is.null,counterId.eq.${eq(counterId)})&select=id,status,vehicleId,sequenceNumber&order=sequenceNumber.asc,issuedAt.asc`
      );
      const waitingRows = waiting || [];
      next = waitingRows.find(
        (t) =>
          t.vehicleId === "veh_unspecified" || !busyVehicleIds.has(t.vehicleId)
      );
      if (!next && waitingRows.length > 0) {
        throw new Error(
          "Waiting customers remain, but their vehicles are already out on test drives. Call a token whose vehicle is free, or complete an active drive."
        );
      }
    }

    if (!next) {
      throw new Error("No waiting tokens in the queue");
    }

    const now = nowISO();
    const fromStatus = next.status;
    await supabaseRest(`tokens?id=eq.${eq(next.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        status: "IN_PROGRESS",
        calledBy: input.performedBy,
        calledAt: now,
        startedAt: now,
        counterId,
        updatedAt: now,
      }),
    });

    await supabaseRest(`vehicles?id=eq.${eq(next.vehicleId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        status: "IN_TEST_DRIVE",
        updatedAt: now,
      }),
    });

    await insertEvent({
      tokenId: next.id,
      eventType: "CALLED",
      fromStatus,
      toStatus: "CALLED",
      performedBy: input.performedBy,
    });
    await insertEvent({
      tokenId: next.id,
      eventType: "STARTED",
      fromStatus: "CALLED",
      toStatus: "IN_PROGRESS",
      performedBy: input.performedBy,
    });

    notifyMutation({ action: "CALLED", tokenId: next.id });
    const enriched = await enrichById(next.id);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  async completeTokenInternal(
    tokenId: string,
    performedBy: string
  ): Promise<Token> {
    return completeTokenInTx(tokenId, performedBy);
  },

  async complete(
    tokenId: string,
    performedBy: string
  ): Promise<TokenWithRelations> {
    await completeTokenInTx(tokenId, performedBy);
    notifyMutation({ action: "COMPLETED", tokenId });
    const enriched = await enrichById(tokenId);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  async recall(
    tokenId: string,
    performedBy: string
  ): Promise<TokenWithRelations> {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?id=eq.${eq(tokenId)}&select=id,status,recallCount&limit=1`
    );
    const row = rows?.[0];
    if (!row) throw new Error("Token not found");
    const status = row.status as TokenStatus;
    if (status !== "CALLED" && status !== "IN_PROGRESS") {
      throw new Error("Only the active token can be recalled");
    }

    const now = nowISO();
    const recallCount = Number(row.recallCount) + 1;
    await supabaseRest(`tokens?id=eq.${eq(tokenId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        recallCount,
        lastRecalledAt: now,
        updatedAt: now,
      }),
    });

    getStore().recallVersion += 1;

    await insertEvent({
      tokenId,
      eventType: "RECALLED",
      fromStatus: status,
      toStatus: status,
      performedBy,
      metadata: { recallCount },
    });

    notifyMutation({ action: "RECALLED", tokenId });
    const enriched = await enrichById(tokenId);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  async skip(input: {
    tokenId: string;
    performedBy: string;
    reason?: string;
  }): Promise<TokenWithRelations> {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?id=eq.${eq(input.tokenId)}&select=id,status,vehicleId&limit=1`
    );
    const row = rows?.[0];
    if (!row) throw new Error("Token not found");
    const status = row.status as TokenStatus;
    const vehicleId = String(row.vehicleId);
    if (
      status !== "WAITING" &&
      status !== "CALLED" &&
      status !== "IN_PROGRESS"
    ) {
      throw new Error("This token cannot be skipped");
    }

    const now = nowISO();
    await supabaseRest(`tokens?id=eq.${eq(input.tokenId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        status: "SKIPPED",
        skipReason: input.reason ?? null,
        skippedAt: now,
        updatedAt: now,
      }),
    });

    await releaseVehicleIfActive(vehicleId, status);

    await insertEvent({
      tokenId: input.tokenId,
      eventType: "SKIPPED",
      fromStatus: status,
      toStatus: "SKIPPED",
      performedBy: input.performedBy,
      reason: input.reason,
    });

    notifyMutation({ action: "SKIPPED", tokenId: input.tokenId });
    const enriched = await enrichById(input.tokenId);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  async cancel(input: {
    tokenId: string;
    performedBy: string;
    reason?: string;
  }): Promise<TokenWithRelations> {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?id=eq.${eq(input.tokenId)}&select=id,status,vehicleId&limit=1`
    );
    const row = rows?.[0];
    if (!row) throw new Error("Token not found");
    const status = row.status as TokenStatus;
    const vehicleId = String(row.vehicleId);
    if (status === "COMPLETED" || status === "CANCELLED") {
      throw new Error("This token cannot be cancelled");
    }

    const now = nowISO();
    await supabaseRest(`tokens?id=eq.${eq(input.tokenId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        status: "CANCELLED",
        cancellationReason: input.reason ?? null,
        cancelledBy: input.performedBy,
        cancelledAt: now,
        updatedAt: now,
      }),
    });

    await releaseVehicleIfActive(vehicleId, status);

    await insertEvent({
      tokenId: input.tokenId,
      eventType: "CANCELLED",
      fromStatus: status,
      toStatus: "CANCELLED",
      performedBy: input.performedBy,
      reason: input.reason,
    });

    notifyMutation({ action: "CANCELLED", tokenId: input.tokenId });
    const enriched = await enrichById(input.tokenId);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  getRecallVersion(): number {
    return getStore().recallVersion;
  },

  getStoreVersion(): number {
    return getStore().version;
  },

  async getAllTokens(): Promise<Token[]> {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      "tokens?select=*&order=issuedAt.asc"
    );
    return (rows || []).map(mapToken);
  },
};
