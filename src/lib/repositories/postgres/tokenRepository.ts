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

const ENRICH_SELECT =
  "*,customer:customers!customerId(*),vehicle:vehicles!vehicleId(*),counter:counters!counterId(*),issuer:users!issuedBy(*),caller:users!calledBy(*)";

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

/** Map PostgREST embed shape (nested objects), not flat SQL join aliases. */
function mapEmbeddedToken(row: Record<string, unknown>): TokenWithRelations {
  const token = mapToken(row);
  const customer = row.customer as Record<string, unknown> | null | undefined;
  const vehicle = row.vehicle as Record<string, unknown> | null | undefined;
  if (!customer?.id || !vehicle?.id) {
    throw new Error("Token relations missing");
  }
  const counter = row.counter as Record<string, unknown> | null | undefined;
  const issuer = row.issuer as Record<string, unknown> | null | undefined;
  const caller = row.caller as Record<string, unknown> | null | undefined;

  return {
    ...token,
    customer: mapCustomer(customer),
    vehicle: mapVehicle(vehicle),
    counter: counter?.id ? mapCounter(counter) : null,
    issuer: mapSafeUser(issuer),
    caller: mapSafeUser(caller),
  };
}

async function fetchRelatedForToken(
  token: Token
): Promise<TokenWithRelations> {
  const [customers, vehicles, counters, issuers, callers] = await Promise.all([
    supabaseRest<Record<string, unknown>[]>(
      `customers?id=eq.${eq(token.customerId)}&select=*&limit=1`
    ),
    supabaseRest<Record<string, unknown>[]>(
      `vehicles?id=eq.${eq(token.vehicleId)}&select=*&limit=1`
    ),
    token.counterId
      ? supabaseRest<Record<string, unknown>[]>(
          `counters?id=eq.${eq(token.counterId)}&select=*&limit=1`
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    supabaseRest<Record<string, unknown>[]>(
      `users?id=eq.${eq(token.issuedBy)}&select=id,email,name,role,active&limit=1`
    ),
    token.calledBy
      ? supabaseRest<Record<string, unknown>[]>(
          `users?id=eq.${eq(token.calledBy)}&select=id,email,name,role,active&limit=1`
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const customer = customers?.[0];
  const vehicle = vehicles?.[0];
  if (!customer || !vehicle) throw new Error("Token relations missing");

  return {
    ...token,
    customer: mapCustomer(customer),
    vehicle: mapVehicle(vehicle),
    counter: counters?.[0] ? mapCounter(counters[0]) : null,
    issuer: mapSafeUser(issuers?.[0]),
    caller: mapSafeUser(callers?.[0]),
  };
}

async function enrichRows(
  rows: Record<string, unknown>[]
): Promise<TokenWithRelations[]> {
  if (!rows.length) return [];
  if ("customer" in rows[0]) {
    try {
      return rows.map(mapEmbeddedToken);
    } catch {
      // embed incomplete — fall through
    }
  }
  return Promise.all(rows.map((r) => fetchRelatedForToken(mapToken(r))));
}

async function enrichById(tokenId: string): Promise<TokenWithRelations | null> {
  try {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?id=eq.${eq(tokenId)}&select=${ENRICH_SELECT}&limit=1`
    );
    if (!rows?.[0]) return null;
    try {
      return mapEmbeddedToken(rows[0]);
    } catch {
      return fetchRelatedForToken(mapToken(rows[0]));
    }
  } catch {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?id=eq.${eq(tokenId)}&select=*&limit=1`
    );
    if (!rows?.[0]) return null;
    return fetchRelatedForToken(mapToken(rows[0]));
  }
}

async function listEnriched(query: string): Promise<TokenWithRelations[]> {
  try {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?${query}&select=${ENRICH_SELECT}`
    );
    return enrichRows(rows || []);
  } catch {
    const rows = await supabaseRest<Record<string, unknown>[]>(
      `tokens?${query}&select=*`
    );
    return enrichRows(rows || []);
  }
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
    const parts: string[] = ["order=issuedAt.desc"];
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
