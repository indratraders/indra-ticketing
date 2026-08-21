import {
  bumpStoreVersion,
  createEntityId,
  getStore,
} from "@/lib/db/demo-store";
import { formatCustomerCode, formatDisplayToken } from "@/lib/utils";
import { getBusinessDate, nowISO } from "@/lib/utils/date";
import { customerRepository } from "@/lib/repositories/customerRepository";
import { settingsRepository } from "@/lib/repositories/settingsRepository";
import { userRepository } from "@/lib/repositories/userRepository";
import { vehicleRepository } from "@/lib/repositories/vehicleRepository";
import type {
  DailySequence,
  Token,
  TokenEvent,
  TokenEventType,
  TokenStatus,
  TokenWithRelations,
} from "@/types";

/** Simple mutex for demo-mode transactional queue operations */
let queueLock: Promise<void> = Promise.resolve();

async function withTransaction<T>(fn: () => T | Promise<T>): Promise<T> {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = queueLock;
  queueLock = previous.then(() => wait);
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

const IN_USE_STATUSES: TokenStatus[] = ["WAITING", "CALLED", "IN_PROGRESS"];

function nextQueueNumber(settings: {
  startingTokenNumber: number;
  maxTokenNumber: number;
}): number {
  const store = getStore();
  const start = Math.max(1, settings.startingTokenNumber || 1);
  const max = Math.max(start, settings.maxTokenNumber || 50);
  const today = getBusinessDate();
  const inUse = new Set(
    store.tokens
      .filter(
        (token) =>
          token.businessDate === today && IN_USE_STATUSES.includes(token.status)
      )
      .map((token) => token.sequenceNumber)
  );

  let candidate = store.lastQueueSequence;
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

function nextCustomerCode(prefix: string): string {
  const store = getStore();
  store.lastCustomerCodeSequence += 1;
  return formatCustomerCode(prefix, store.lastCustomerCodeSequence);
}

function enrichToken(token: Token): TokenWithRelations {
  const customer = customerRepository.findById(token.customerId);
  const vehicle = vehicleRepository.findById(token.vehicleId);
  const counter = token.counterId
    ? settingsRepository.findCounterById(token.counterId)
    : null;

  if (!customer || !vehicle) {
    throw new Error("Token relations missing");
  }

  return {
    ...token,
    customer,
    vehicle,
    counter,
    issuer: userRepository.findSafeById(token.issuedBy),
    caller: token.calledBy
      ? userRepository.findSafeById(token.calledBy)
      : null,
  };
}

function addEvent(input: {
  tokenId: string;
  eventType: TokenEventType;
  fromStatus: TokenStatus | null;
  toStatus: TokenStatus | null;
  performedBy: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): TokenEvent {
  const event: TokenEvent = {
    id: createEntityId("evt"),
    tokenId: input.tokenId,
    eventType: input.eventType,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    performedBy: input.performedBy,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    createdAt: nowISO(),
  };
  getStore().tokenEvents.push(event);
  return event;
}

function getOrCreateSequence(
  businessDate: string,
  prefix: string
): DailySequence {
  const store = getStore();
  let seq = store.dailySequences.find(
    (s) => s.businessDate === businessDate && s.prefix === prefix
  );
  if (!seq) {
    seq = {
      id: createEntityId("seq"),
      businessDate,
      prefix,
      lastSequence: 0,
      counterId: null,
    };
    store.dailySequences.push(seq);
  }
  return seq;
}

/**
 * DEMO: in-memory token repository with transaction-safe queue ops.
 * Replace with Prisma transactions when MySQL is connected.
 */
export const tokenRepository = {
  withTransaction,

  findById(id: string): Token | null {
    return getStore().tokens.find((t) => t.id === id) ?? null;
  },

  findEnrichedById(id: string): TokenWithRelations | null {
    const token = this.findById(id);
    return token ? enrichToken(token) : null;
  },

  listByBusinessDate(businessDate?: string): TokenWithRelations[] {
    const date = businessDate ?? getBusinessDate();
    return getStore()
      .tokens.filter((t) => t.businessDate === date)
      .sort(
        (a, b) =>
          new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()
      )
      .map(enrichToken);
  },

  listByStatus(
    status: TokenStatus | TokenStatus[],
    businessDate?: string
  ): TokenWithRelations[] {
    const statuses = Array.isArray(status) ? status : [status];
    const date = businessDate ?? getBusinessDate();
    return getStore()
      .tokens.filter(
        (t) => t.businessDate === date && statuses.includes(t.status)
      )
      .sort(
        (a, b) =>
          a.sequenceNumber - b.sequenceNumber ||
          new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()
      )
      .map(enrichToken);
  },

  getActiveToken(counterId?: string | null): TokenWithRelations | null {
    return this.listActiveTokens(counterId)[0] ?? null;
  },

  listActiveTokens(counterId?: string | null): TokenWithRelations[] {
    const date = getBusinessDate();
    return getStore()
      .tokens.filter(
        (t) =>
          t.businessDate === date &&
          (t.status === "CALLED" || t.status === "IN_PROGRESS") &&
          (!counterId || t.counterId === counterId)
      )
      .sort(
        (a, b) =>
          new Date(a.calledAt ?? a.issuedAt).getTime() -
          new Date(b.calledAt ?? b.issuedAt).getTime()
      )
      .map(enrichToken);
  },

  /** All active tokens for the business day (across counters) */
  listAllActiveTokens(): TokenWithRelations[] {
    const date = getBusinessDate();
    return getStore()
      .tokens.filter(
        (t) =>
          t.businessDate === date &&
          (t.status === "CALLED" || t.status === "IN_PROGRESS")
      )
      .sort(
        (a, b) =>
          new Date(a.calledAt ?? a.issuedAt).getTime() -
          new Date(b.calledAt ?? b.issuedAt).getTime()
      )
      .map(enrichToken);
  },

  getOldestWaiting(counterId?: string | null): TokenWithRelations | null {
    const waiting = this.listByStatus("WAITING").filter(
      (t) => !counterId || !t.counterId || t.counterId === counterId
    );
    return waiting[0] ?? null;
  },

  getPreviousCompletedOrActive(
    currentId?: string | null
  ): TokenWithRelations | null {
    const date = getBusinessDate();
    const candidates = getStore()
      .tokens.filter(
        (t) =>
          t.businessDate === date &&
          t.id !== currentId &&
          (t.status === "COMPLETED" ||
            t.status === "CALLED" ||
            t.status === "IN_PROGRESS")
      )
      .sort(
        (a, b) =>
          new Date(b.calledAt ?? b.completedAt ?? b.issuedAt).getTime() -
          new Date(a.calledAt ?? a.completedAt ?? a.issuedAt).getTime()
      );
    return candidates[0] ? enrichToken(candidates[0]) : null;
  },

  listHistory(filters: {
    businessDate?: string;
    status?: TokenStatus;
    search?: string;
    vehicleId?: string;
    officerId?: string;
    page?: number;
    pageSize?: number;
  }): { items: TokenWithRelations[]; total: number } {
    let items = getStore().tokens.map(enrichToken);

    if (filters.businessDate) {
      items = items.filter((t) => t.businessDate === filters.businessDate);
    }
    if (filters.status) {
      items = items.filter((t) => t.status === filters.status);
    }
    if (filters.vehicleId) {
      items = items.filter((t) => t.vehicleId === filters.vehicleId);
    }
    if (filters.officerId) {
      items = items.filter(
        (t) =>
          t.issuedBy === filters.officerId || t.calledBy === filters.officerId
      );
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (t) =>
          t.tokenNumber.toLowerCase().includes(q) ||
          (t.customerCode ?? "").toLowerCase().includes(q) ||
          t.customer.name.toLowerCase().includes(q) ||
          t.customer.contactNumber.includes(q) ||
          `${t.vehicle.brand} ${t.vehicle.model}`.toLowerCase().includes(q)
      );
    }

    items.sort(
      (a, b) =>
        new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
    );

    const total = items.length;
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total };
  },

  listEvents(tokenId: string): TokenEvent[] {
    return getStore()
      .tokenEvents.filter((e) => e.tokenId === tokenId)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  },

  async createToken(input: {
    customerId: string;
    vehicleId: string;
    testDriveType: Token["testDriveType"];
    notes?: string | null;
    counterId?: string | null;
    issuedBy: string;
  }): Promise<TokenWithRelations> {
    return withTransaction(() => {
      const store = getStore();
      const settings = store.settings;
      const businessDate = getBusinessDate();
      const max = settings.maxTokenNumber || 50;
      const start = settings.startingTokenNumber || 1;

      // Queue display number cycles 1 → 50 → 1 …
      const nextSequence = nextQueueNumber(settings);
      const tokenNumber = formatDisplayToken(nextSequence);

      // Unique customer code keeps incrementing: C0001, C0002, …
      const customerCode = nextCustomerCode(
        settings.customerCodePrefix || "C"
      );

      const duplicateCode = store.tokens.find(
        (t) => t.customerCode === customerCode
      );
      if (duplicateCode) {
        throw new Error("Duplicate customer code generated");
      }

      store.lastQueueSequence = nextSequence;
      const seq = getOrCreateSequence(businessDate, "QUEUE");
      seq.lastSequence = nextSequence;

      const now = nowISO();
      const token: Token = {
        id: createEntityId("tok"),
        tokenNumber,
        tokenPrefix: "",
        sequenceNumber: nextSequence,
        customerCode,
        businessDate,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        testDriveType: input.testDriveType,
        status: "WAITING",
        counterId: input.counterId ?? settings.defaultCounterId,
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
      };

      store.tokens.push(token);
      addEvent({
        tokenId: token.id,
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
      bumpStoreVersion();
      return enrichToken(token);
    });
  },

  async callNext(input: {
    performedBy: string;
    counterId?: string | null;
    autoComplete: boolean;
    maxConcurrent: number;
    tokenId?: string | null;
  }): Promise<TokenWithRelations> {
    return withTransaction(() => {
      const counterId = input.counterId ?? getStore().settings.defaultCounterId;
      const maxConcurrent = Math.max(1, input.maxConcurrent || 6);
      const allActive = this.listAllActiveTokens();

      if (allActive.length >= maxConcurrent) {
        if (!input.autoComplete) {
          throw new Error(
            `All ${maxConcurrent} test drive slots are full. Complete a drive before calling the next customer.`
          );
        }
        // Free oldest slot
        this.completeTokenInternal(allActive[0].id, input.performedBy);
      }

      const busyVehicleIds = new Set(
        this.listAllActiveTokens()
          .filter((t) => t.vehicleId !== "veh_unspecified")
          .filter(
            (t) =>
              !(
                t.vehicle.brand.toLowerCase() === "other" &&
                t.vehicle.model.toLowerCase() === "not specified"
              )
          )
          .map((t) => t.vehicleId)
      );

      let next: TokenWithRelations | null = null;
      if (input.tokenId) {
        const specific = this.findEnrichedById(input.tokenId);
        if (!specific || specific.status !== "WAITING") {
          throw new Error("Selected token is not waiting");
        }
        if (busyVehicleIds.has(specific.vehicleId)) {
          throw new Error(
            `${specific.vehicle.brand} ${specific.vehicle.model} is already on a test drive. Complete that drive first.`
          );
        }
        next = specific;
      } else {
        // Lowest token number first; skip only when that vehicle is already out
        const waiting = this.listByStatus("WAITING")
          .filter(
            (t) => !counterId || !t.counterId || t.counterId === counterId
          )
          .slice()
          .sort(
            (a, b) =>
              a.sequenceNumber - b.sequenceNumber ||
              new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()
          );
        next =
          waiting.find(
            (t) =>
              t.vehicleId === "veh_unspecified" ||
              (t.vehicle.brand.toLowerCase() === "other" &&
                t.vehicle.model.toLowerCase() === "not specified") ||
              !busyVehicleIds.has(t.vehicleId)
          ) ?? null;
        if (!next && waiting.length > 0) {
          throw new Error(
            "Waiting customers remain, but their vehicles are already out on test drives. Call a token whose vehicle is free, or complete an active drive."
          );
        }
      }

      if (!next) {
        throw new Error("No waiting tokens in the queue");
      }

      const store = getStore();
      const idx = store.tokens.findIndex((t) => t.id === next!.id);
      if (idx < 0) throw new Error("Token not found");

      const now = nowISO();
      const fromStatus = store.tokens[idx].status;
      store.tokens[idx] = {
        ...store.tokens[idx],
        status: "IN_PROGRESS",
        calledBy: input.performedBy,
        calledAt: now,
        startedAt: now,
        counterId,
        updatedAt: now,
      };

      const vehicle = store.vehicles.find(
        (v) => v.id === store.tokens[idx].vehicleId
      );
      if (vehicle) {
        vehicle.status = "IN_TEST_DRIVE";
        vehicle.updatedAt = now;
      }

      addEvent({
        tokenId: next.id,
        eventType: "CALLED",
        fromStatus,
        toStatus: "CALLED",
        performedBy: input.performedBy,
      });
      addEvent({
        tokenId: next.id,
        eventType: "STARTED",
        fromStatus: "CALLED",
        toStatus: "IN_PROGRESS",
        performedBy: input.performedBy,
      });

      bumpStoreVersion();
      return enrichToken(store.tokens[idx]);
    });
  },

  completeTokenInternal(tokenId: string, performedBy: string): Token {
    const store = getStore();
    const idx = store.tokens.findIndex((t) => t.id === tokenId);
    if (idx < 0) throw new Error("Token not found");
    const token = store.tokens[idx];
    if (token.status !== "CALLED" && token.status !== "IN_PROGRESS") {
      throw new Error("Only an active token can be completed");
    }
    const now = nowISO();
    const fromStatus = token.status;
    store.tokens[idx] = {
      ...token,
      status: "COMPLETED",
      completedAt: now,
      updatedAt: now,
    };
    const vehicle = store.vehicles.find((v) => v.id === token.vehicleId);
    if (vehicle && vehicle.status === "IN_TEST_DRIVE") {
      vehicle.status = "AVAILABLE";
      vehicle.updatedAt = now;
    }
    addEvent({
      tokenId,
      eventType: "COMPLETED",
      fromStatus,
      toStatus: "COMPLETED",
      performedBy,
    });
    return store.tokens[idx];
  },

  async complete(tokenId: string, performedBy: string): Promise<TokenWithRelations> {
    return withTransaction(() => {
      const token = this.completeTokenInternal(tokenId, performedBy);
      bumpStoreVersion();
      return enrichToken(token);
    });
  },

  async recall(tokenId: string, performedBy: string): Promise<TokenWithRelations> {
    return withTransaction(() => {
      const store = getStore();
      const idx = store.tokens.findIndex((t) => t.id === tokenId);
      if (idx < 0) throw new Error("Token not found");
      const token = store.tokens[idx];
      if (token.status !== "CALLED" && token.status !== "IN_PROGRESS") {
        throw new Error("Only the active token can be recalled");
      }
      const now = nowISO();
      store.tokens[idx] = {
        ...token,
        recallCount: token.recallCount + 1,
        lastRecalledAt: now,
        updatedAt: now,
      };
      store.recallVersion += 1;
      addEvent({
        tokenId,
        eventType: "RECALLED",
        fromStatus: token.status,
        toStatus: token.status,
        performedBy,
        metadata: { recallCount: store.tokens[idx].recallCount },
      });
      bumpStoreVersion();
      return enrichToken(store.tokens[idx]);
    });
  },

  async skip(input: {
    tokenId: string;
    performedBy: string;
    reason?: string;
  }): Promise<TokenWithRelations> {
    return withTransaction(() => {
      const store = getStore();
      const idx = store.tokens.findIndex((t) => t.id === input.tokenId);
      if (idx < 0) throw new Error("Token not found");
      const token = store.tokens[idx];
      if (
        token.status !== "WAITING" &&
        token.status !== "CALLED" &&
        token.status !== "IN_PROGRESS"
      ) {
        throw new Error("This token cannot be skipped");
      }
      const now = nowISO();
      const fromStatus = token.status;
      store.tokens[idx] = {
        ...token,
        status: "SKIPPED",
        skipReason: input.reason ?? null,
        skippedAt: now,
        updatedAt: now,
      };
      if (fromStatus === "CALLED" || fromStatus === "IN_PROGRESS") {
        const vehicle = store.vehicles.find((v) => v.id === token.vehicleId);
        if (vehicle && vehicle.status === "IN_TEST_DRIVE") {
          vehicle.status = "AVAILABLE";
          vehicle.updatedAt = now;
        }
      }
      addEvent({
        tokenId: input.tokenId,
        eventType: "SKIPPED",
        fromStatus,
        toStatus: "SKIPPED",
        performedBy: input.performedBy,
        reason: input.reason,
      });
      bumpStoreVersion();
      return enrichToken(store.tokens[idx]);
    });
  },

  async cancel(input: {
    tokenId: string;
    performedBy: string;
    reason?: string;
  }): Promise<TokenWithRelations> {
    return withTransaction(() => {
      const store = getStore();
      const idx = store.tokens.findIndex((t) => t.id === input.tokenId);
      if (idx < 0) throw new Error("Token not found");
      const token = store.tokens[idx];
      if (
        token.status === "COMPLETED" ||
        token.status === "CANCELLED"
      ) {
        throw new Error("This token cannot be cancelled");
      }
      const now = nowISO();
      const fromStatus = token.status;
      store.tokens[idx] = {
        ...token,
        status: "CANCELLED",
        cancellationReason: input.reason ?? null,
        cancelledBy: input.performedBy,
        cancelledAt: now,
        updatedAt: now,
      };
      if (fromStatus === "CALLED" || fromStatus === "IN_PROGRESS") {
        const vehicle = store.vehicles.find((v) => v.id === token.vehicleId);
        if (vehicle && vehicle.status === "IN_TEST_DRIVE") {
          vehicle.status = "AVAILABLE";
          vehicle.updatedAt = now;
        }
      }
      addEvent({
        tokenId: input.tokenId,
        eventType: "CANCELLED",
        fromStatus,
        toStatus: "CANCELLED",
        performedBy: input.performedBy,
        reason: input.reason,
      });
      bumpStoreVersion();
      return enrichToken(store.tokens[idx]);
    });
  },

  getRecallVersion(): number {
    return getStore().recallVersion;
  },

  getStoreVersion(): number {
    return getStore().version;
  },

  getAllTokens(): Token[] {
    return [...getStore().tokens];
  },
};
