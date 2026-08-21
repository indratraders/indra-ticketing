import {
  broadcastRealtime,
  bumpStoreVersion,
  createEntityId,
  getStore,
} from "@/lib/db/demo-store";
import { getPgPool, withPgTransaction } from "@/lib/db/postgres";
import { formatCustomerCode, formatDisplayToken } from "@/lib/utils";
import { getBusinessDate, nowISO } from "@/lib/utils/date";
import type {
  Token,
  TokenEvent,
  TokenEventType,
  TokenStatus,
  TokenWithRelations,
} from "@/types";
import type { PoolClient } from "pg";
import {
  mapEnrichedToken,
  mapToken,
  mapTokenEvent,
} from "../mssql/mappers";

const SETTINGS_ID = "settings_default";

/** PostgreSQL-safe enrich SELECT (quoted camelCase + to_char for businessDate). */
const ENRICH_SELECT = `
  t.id, t."tokenNumber", t."tokenPrefix", t."sequenceNumber", t."customerCode",
  to_char(t."businessDate", 'YYYY-MM-DD') AS "businessDateStr",
  t."customerId", t."vehicleId", t."testDriveType", t.status, t."counterId",
  t."issuedBy", t."calledBy", t.notes, t."skipReason", t."cancellationReason", t."cancelledBy",
  t."issuedAt", t."calledAt", t."startedAt", t."completedAt", t."skippedAt", t."cancelledAt",
  t."recallCount", t."lastRecalledAt", t."createdAt", t."updatedAt",
  c.id AS c_id, c.name AS c_name, c."contactNumber" AS "c_contactNumber",
  c.nic AS c_nic, c.email AS c_email, c."createdAt" AS "c_createdAt", c."updatedAt" AS "c_updatedAt",
  v.id AS v_id, v.brand AS v_brand, v.model AS v_model,
  v."registrationNumber" AS "v_registrationNumber", v.status AS v_status, v.active AS v_active,
  v."createdAt" AS "v_createdAt", v."updatedAt" AS "v_updatedAt",
  ctr.id AS ctr_id, ctr.name AS ctr_name, ctr.code AS ctr_code, ctr.active AS ctr_active,
  ctr."createdAt" AS "ctr_createdAt", ctr."updatedAt" AS "ctr_updatedAt",
  iu.id AS iu_id, iu.email AS iu_email, iu.name AS iu_name, iu.role AS iu_role, iu.active AS iu_active,
  cu.id AS cu_id, cu.email AS cu_email, cu.name AS cu_name, cu.role AS cu_role, cu.active AS cu_active
`;

const TOKEN_ENRICH_FROM = `
  FROM tokens t
  INNER JOIN customers c ON c.id = t."customerId"
  INNER JOIN vehicles v ON v.id = t."vehicleId"
  LEFT JOIN counters ctr ON ctr.id = t."counterId"
  LEFT JOIN users iu ON iu.id = t."issuedBy"
  LEFT JOIN users cu ON cu.id = t."calledBy"
`;

const TOKEN_SELECT = `
  *, to_char("businessDate", 'YYYY-MM-DD') AS "businessDateStr"
`;

function notifyMutation(extra?: Record<string, unknown>) {
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

async function enrichById(
  tokenId: string,
  client?: PoolClient
): Promise<TokenWithRelations | null> {
  const sql = `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t.id = $1
       LIMIT 1`;
  const result = client
    ? await client.query(sql, [tokenId])
    : await (await getPgPool()).query(sql, [tokenId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapEnrichedToken(row) : null;
}

async function insertEvent(
  client: PoolClient,
  input: {
    tokenId: string;
    eventType: TokenEventType;
    fromStatus: TokenStatus | null;
    toStatus: TokenStatus | null;
    performedBy: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO token_events
      (id, "tokenId", "eventType", "fromStatus", "toStatus", "performedBy", reason, metadata, "createdAt")
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      createEntityId("evt"),
      input.tokenId,
      input.eventType,
      input.fromStatus,
      input.toStatus,
      input.performedBy,
      input.reason ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      new Date(),
    ]
  );
}

async function completeTokenInTx(
  client: PoolClient,
  tokenId: string,
  performedBy: string
): Promise<Token> {
  const found = await client.query(
    `SELECT ${TOKEN_SELECT}
     FROM tokens WHERE id = $1
     LIMIT 1`,
    [tokenId]
  );
  const row = found.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("Token not found");
  const token = mapToken(row);
  if (token.status !== "CALLED" && token.status !== "IN_PROGRESS") {
    throw new Error("Only an active token can be completed");
  }

  const now = new Date();
  await client.query(
    `UPDATE tokens SET
       status = 'COMPLETED',
       "completedAt" = $1,
       "updatedAt" = $2
     WHERE id = $3`,
    [now, now, tokenId]
  );

  await client.query(
    `UPDATE vehicles SET
       status = 'AVAILABLE',
       "updatedAt" = $1
     WHERE id = $2 AND status = 'IN_TEST_DRIVE'`,
    [now, token.vehicleId]
  );

  await insertEvent(client, {
    tokenId,
    eventType: "COMPLETED",
    fromStatus: token.status,
    toStatus: "COMPLETED",
    performedBy,
  });

  return {
    ...token,
    status: "COMPLETED",
    completedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function releaseVehicleIfActive(
  client: PoolClient,
  vehicleId: string,
  fromStatus: TokenStatus
) {
  if (fromStatus !== "CALLED" && fromStatus !== "IN_PROGRESS") return;
  await client.query(
    `UPDATE vehicles SET
       status = 'AVAILABLE',
       "updatedAt" = $1
     WHERE id = $2 AND status = 'IN_TEST_DRIVE'`,
    [new Date(), vehicleId]
  );
}

export const tokenRepository = {
  withTransaction,

  async findById(id: string): Promise<Token | null> {
    const pool = await getPgPool();
    const result = await pool.query(
      `SELECT ${TOKEN_SELECT}
       FROM tokens WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapToken(row) : null;
  },

  async findEnrichedById(id: string): Promise<TokenWithRelations | null> {
    return enrichById(id);
  },

  async listByBusinessDate(
    businessDate?: string
  ): Promise<TokenWithRelations[]> {
    const date = businessDate ?? getBusinessDate();
    const pool = await getPgPool();
    const result = await pool.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t."businessDate" = $1::date
       ORDER BY t."issuedAt" ASC`,
      [date]
    );
    return (result.rows as Record<string, unknown>[]).map(mapEnrichedToken);
  },

  async listByStatus(
    status: TokenStatus | TokenStatus[],
    businessDate?: string
  ): Promise<TokenWithRelations[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const date = businessDate ?? getBusinessDate();
    const pool = await getPgPool();
    const statusPlaceholders = statuses
      .map((_, i) => `$${i + 2}`)
      .join(", ");
    const result = await pool.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t."businessDate" = $1::date
         AND t.status IN (${statusPlaceholders})
       ORDER BY t."sequenceNumber" ASC, t."issuedAt" ASC`,
      [date, ...statuses]
    );
    return (result.rows as Record<string, unknown>[]).map(mapEnrichedToken);
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
    const pool = await getPgPool();
    const params: unknown[] = [date];
    let counterFilter = "";
    if (counterId) {
      params.push(counterId);
      counterFilter = `AND t."counterId" = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t."businessDate" = $1::date
         AND t.status IN ('CALLED', 'IN_PROGRESS')
         ${counterFilter}
       ORDER BY t."calledAt" ASC, t."issuedAt" ASC`,
      params
    );
    return (result.rows as Record<string, unknown>[]).map(mapEnrichedToken);
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
    const pool = await getPgPool();
    const params: unknown[] = [date];
    let exclude = "";
    if (currentId) {
      params.push(currentId);
      exclude = `AND t.id <> $${params.length}`;
    }
    const result = await pool.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t."businessDate" = $1::date
         ${exclude}
         AND t.status IN ('COMPLETED', 'CALLED', 'IN_PROGRESS')
       ORDER BY COALESCE(t."calledAt", t."completedAt", t."issuedAt") DESC
       LIMIT 1`,
      params
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapEnrichedToken(row) : null;
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
    const pool = await getPgPool();
    const params: unknown[] = [];
    const where: string[] = ["1=1"];

    if (filters.businessDate) {
      params.push(filters.businessDate);
      where.push(`t."businessDate" = $${params.length}::date`);
    }
    if (filters.status) {
      params.push(filters.status);
      where.push(`t.status = $${params.length}`);
    }
    if (filters.vehicleId) {
      params.push(filters.vehicleId);
      where.push(`t."vehicleId" = $${params.length}`);
    }
    if (filters.officerId) {
      params.push(filters.officerId);
      where.push(
        `(t."issuedBy" = $${params.length} OR t."calledBy" = $${params.length})`
      );
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(
        `(t."tokenNumber" LIKE $${params.length}
          OR t."customerCode" LIKE $${params.length}
          OR c.name LIKE $${params.length}
          OR c."contactNumber" LIKE $${params.length}
          OR (v.brand || ' ' || v.model) LIKE $${params.length})`
      );
    }

    const whereSql = where.join(" AND ");
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(1)::int AS total
       ${TOKEN_ENRICH_FROM}
       WHERE ${whereSql}`,
      params
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const pageParams = [...params, offset, pageSize];
    const result = await pool.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE ${whereSql}
       ORDER BY t."issuedAt" DESC
       OFFSET $${pageParams.length - 1} LIMIT $${pageParams.length}`,
      pageParams
    );

    return {
      items: (result.rows as Record<string, unknown>[]).map(mapEnrichedToken),
      total,
    };
  },

  async listEvents(tokenId: string): Promise<TokenEvent[]> {
    const pool = await getPgPool();
    const result = await pool.query(
      `SELECT * FROM token_events
       WHERE "tokenId" = $1
       ORDER BY "createdAt" ASC`,
      [tokenId]
    );
    return (result.rows as Record<string, unknown>[]).map(mapTokenEvent);
  },

  async createToken(input: {
    customerId: string;
    vehicleId: string;
    testDriveType: Token["testDriveType"];
    notes?: string | null;
    counterId?: string | null;
    issuedBy: string;
  }): Promise<TokenWithRelations> {
    const tokenId = await withPgTransaction(async (client) => {
      const settingsResult = await client.query(
        `SELECT * FROM settings
         WHERE id = $1
         FOR UPDATE`,
        [SETTINGS_ID]
      );
      const settingsRow = settingsResult.rows[0] as
        | Record<string, unknown>
        | undefined;
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
      const businessDate = getBusinessDate();

      const inUseResult = await client.query<{ sequenceNumber: number }>(
        `SELECT "sequenceNumber" FROM tokens
         WHERE "businessDate" = $1::date
           AND status IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
        [businessDate]
      );
      const inUse = new Set<number>(
        inUseResult.rows.map((row) => Number(row.sequenceNumber))
      );

      const nextSequence = nextQueueNumber(lastQueue, start, max, inUse);
      const nextCustomerSeq = lastCustomerCode + 1;
      const tokenNumber = formatDisplayToken(nextSequence);
      const customerCode = formatCustomerCode(prefix, nextCustomerSeq);
      const counterId = input.counterId ?? defaultCounterId;
      const now = new Date();
      const id = createEntityId("tok");

      const dup = await client.query(
        `SELECT id FROM tokens WHERE "customerCode" = $1 LIMIT 1`,
        [customerCode]
      );
      if (dup.rows[0]) {
        throw new Error("Duplicate customer code generated");
      }

      await client.query(
        `UPDATE settings SET
           "lastQueueSequence" = $1,
           "lastCustomerCodeSequence" = $2,
           "updatedAt" = $3
         WHERE id = $4`,
        [nextSequence, nextCustomerSeq, now, SETTINGS_ID]
      );

      const seqId = createEntityId("seq");
      await client.query(
        `INSERT INTO daily_sequences (id, "businessDate", prefix, "lastSequence", "counterId")
         VALUES ($1, $2::date, $3, $4, NULL)
         ON CONFLICT ("businessDate", prefix)
         DO UPDATE SET "lastSequence" = EXCLUDED."lastSequence"`,
        [seqId, businessDate, "QUEUE", nextSequence]
      );

      await client.query(
        `INSERT INTO tokens (
           id, "tokenNumber", "tokenPrefix", "sequenceNumber", "customerCode", "businessDate",
           "customerId", "vehicleId", "testDriveType", status, "counterId", "issuedBy", "calledBy",
           notes, "skipReason", "cancellationReason", "cancelledBy",
           "issuedAt", "calledAt", "startedAt", "completedAt", "skippedAt", "cancelledAt",
           "recallCount", "lastRecalledAt", "createdAt", "updatedAt"
         ) VALUES (
           $1, $2, $3, $4, $5, $6::date,
           $7, $8, $9, $10, $11, $12, NULL,
           $13, NULL, NULL, NULL,
           $14, NULL, NULL, NULL, NULL, NULL,
           0, NULL, $15, $16
         )`,
        [
          id,
          tokenNumber,
          "",
          nextSequence,
          customerCode,
          businessDate,
          input.customerId,
          input.vehicleId,
          input.testDriveType,
          "WAITING",
          counterId,
          input.issuedBy,
          input.notes ?? null,
          now,
          now,
          now,
        ]
      );

      await insertEvent(client, {
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

      return id;
    });

    notifyMutation({ action: "ISSUED", tokenId });
    const enriched = await enrichById(tokenId);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  async callNext(input: {
    performedBy: string;
    counterId?: string | null;
    autoComplete: boolean;
    maxConcurrent: number;
    tokenId?: string | null;
  }): Promise<TokenWithRelations> {
    const tokenId = await withPgTransaction(async (client) => {
      const settingsResult = await client.query(
        `SELECT "defaultCounterId" FROM settings WHERE id = $1 LIMIT 1`,
        [SETTINGS_ID]
      );
      const defaultCounterId = String(
        (settingsResult.rows[0] as Record<string, unknown> | undefined)
          ?.defaultCounterId ?? ""
      );
      const counterId = input.counterId ?? defaultCounterId;
      const businessDate = getBusinessDate();
      const maxConcurrent = Math.max(1, input.maxConcurrent || 6);

      const activeResult = await client.query<{
        id: string;
        vehicleId: string;
        status: TokenStatus;
      }>(
        `SELECT id, "vehicleId", status FROM tokens
         WHERE "businessDate" = $1::date
           AND status IN ('CALLED', 'IN_PROGRESS')
         ORDER BY "calledAt" ASC, "issuedAt" ASC
         FOR UPDATE`,
        [businessDate]
      );
      let activeRows = activeResult.rows;

      if (activeRows.length >= maxConcurrent) {
        if (!input.autoComplete) {
          throw new Error(
            `All ${maxConcurrent} test drive slots are full. Complete a drive before calling the next customer.`
          );
        }
        await completeTokenInTx(client, activeRows[0].id, input.performedBy);
        activeRows = activeRows.slice(1);
      }

      const busyVehicleIds = new Set(
        activeRows
          .filter((r) => r.vehicleId !== "veh_unspecified")
          .map((r) => r.vehicleId)
      );

      let next: { id: string; status: TokenStatus; vehicleId: string } | undefined;

      if (input.tokenId) {
        const specificResult = await client.query<{
          id: string;
          status: TokenStatus;
          vehicleId: string;
        }>(
          `SELECT id, status, "vehicleId" FROM tokens
           WHERE id = $1
           FOR UPDATE`,
          [input.tokenId]
        );
        const specific = specificResult.rows[0];
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
        const waitingResult = await client.query<{
          id: string;
          status: TokenStatus;
          vehicleId: string;
          sequenceNumber: number;
        }>(
          `SELECT id, status, "vehicleId", "sequenceNumber" FROM tokens
           WHERE "businessDate" = $1::date
             AND status = 'WAITING'
             AND ("counterId" IS NULL OR "counterId" = $2)
           ORDER BY "sequenceNumber" ASC, "issuedAt" ASC
           FOR UPDATE`,
          [businessDate, counterId]
        );
        const waiting = waitingResult.rows;
        next = waiting.find(
          (t) =>
            t.vehicleId === "veh_unspecified" ||
            !busyVehicleIds.has(t.vehicleId)
        );
        if (!next && waiting.length > 0) {
          throw new Error(
            "Waiting customers remain, but their vehicles are already out on test drives. Call a token whose vehicle is free, or complete an active drive."
          );
        }
      }

      if (!next) {
        throw new Error("No waiting tokens in the queue");
      }

      const now = new Date();
      const fromStatus = next.status;
      await client.query(
        `UPDATE tokens SET
           status = 'IN_PROGRESS',
           "calledBy" = $1,
           "calledAt" = $2,
           "startedAt" = $3,
           "counterId" = $4,
           "updatedAt" = $5
         WHERE id = $6`,
        [input.performedBy, now, now, counterId, now, next.id]
      );

      await client.query(
        `UPDATE vehicles SET
           status = 'IN_TEST_DRIVE',
           "updatedAt" = $1
         WHERE id = $2`,
        [now, next.vehicleId]
      );

      await insertEvent(client, {
        tokenId: next.id,
        eventType: "CALLED",
        fromStatus,
        toStatus: "CALLED",
        performedBy: input.performedBy,
      });
      await insertEvent(client, {
        tokenId: next.id,
        eventType: "STARTED",
        fromStatus: "CALLED",
        toStatus: "IN_PROGRESS",
        performedBy: input.performedBy,
      });

      return next.id;
    });

    notifyMutation({ action: "CALLED", tokenId });
    const enriched = await enrichById(tokenId);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  async completeTokenInternal(
    tokenId: string,
    performedBy: string
  ): Promise<Token> {
    return withPgTransaction(async (client) =>
      completeTokenInTx(client, tokenId, performedBy)
    );
  },

  async complete(
    tokenId: string,
    performedBy: string
  ): Promise<TokenWithRelations> {
    await withPgTransaction(async (client) => {
      await completeTokenInTx(client, tokenId, performedBy);
    });
    notifyMutation({ action: "COMPLETED", tokenId });
    const enriched = await enrichById(tokenId);
    if (!enriched) throw new Error("Token relations missing");
    return enriched;
  },

  async recall(
    tokenId: string,
    performedBy: string
  ): Promise<TokenWithRelations> {
    await withPgTransaction(async (client) => {
      const found = await client.query<{
        id: string;
        status: TokenStatus;
        recallCount: number;
      }>(
        `SELECT id, status, "recallCount" FROM tokens
         WHERE id = $1
         FOR UPDATE`,
        [tokenId]
      );
      const row = found.rows[0];
      if (!row) throw new Error("Token not found");
      if (row.status !== "CALLED" && row.status !== "IN_PROGRESS") {
        throw new Error("Only the active token can be recalled");
      }

      const now = new Date();
      const recallCount = Number(row.recallCount) + 1;
      await client.query(
        `UPDATE tokens SET
           "recallCount" = $1,
           "lastRecalledAt" = $2,
           "updatedAt" = $3
         WHERE id = $4`,
        [recallCount, now, now, tokenId]
      );

      getStore().recallVersion += 1;

      await insertEvent(client, {
        tokenId,
        eventType: "RECALLED",
        fromStatus: row.status,
        toStatus: row.status,
        performedBy,
        metadata: { recallCount },
      });
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
    await withPgTransaction(async (client) => {
      const found = await client.query<{
        id: string;
        status: TokenStatus;
        vehicleId: string;
      }>(
        `SELECT id, status, "vehicleId" FROM tokens
         WHERE id = $1
         FOR UPDATE`,
        [input.tokenId]
      );
      const row = found.rows[0];
      if (!row) throw new Error("Token not found");
      if (
        row.status !== "WAITING" &&
        row.status !== "CALLED" &&
        row.status !== "IN_PROGRESS"
      ) {
        throw new Error("This token cannot be skipped");
      }

      const now = new Date();
      await client.query(
        `UPDATE tokens SET
           status = 'SKIPPED',
           "skipReason" = $1,
           "skippedAt" = $2,
           "updatedAt" = $3
         WHERE id = $4`,
        [input.reason ?? null, now, now, input.tokenId]
      );

      await releaseVehicleIfActive(client, row.vehicleId, row.status);

      await insertEvent(client, {
        tokenId: input.tokenId,
        eventType: "SKIPPED",
        fromStatus: row.status,
        toStatus: "SKIPPED",
        performedBy: input.performedBy,
        reason: input.reason,
      });
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
    await withPgTransaction(async (client) => {
      const found = await client.query<{
        id: string;
        status: TokenStatus;
        vehicleId: string;
      }>(
        `SELECT id, status, "vehicleId" FROM tokens
         WHERE id = $1
         FOR UPDATE`,
        [input.tokenId]
      );
      const row = found.rows[0];
      if (!row) throw new Error("Token not found");
      if (row.status === "COMPLETED" || row.status === "CANCELLED") {
        throw new Error("This token cannot be cancelled");
      }

      const now = new Date();
      await client.query(
        `UPDATE tokens SET
           status = 'CANCELLED',
           "cancellationReason" = $1,
           "cancelledBy" = $2,
           "cancelledAt" = $3,
           "updatedAt" = $4
         WHERE id = $5`,
        [input.reason ?? null, input.performedBy, now, now, input.tokenId]
      );

      await releaseVehicleIfActive(client, row.vehicleId, row.status);

      await insertEvent(client, {
        tokenId: input.tokenId,
        eventType: "CANCELLED",
        fromStatus: row.status,
        toStatus: "CANCELLED",
        performedBy: input.performedBy,
        reason: input.reason,
      });
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
    const pool = await getPgPool();
    const result = await pool.query(
      `SELECT ${TOKEN_SELECT}
       FROM tokens
       ORDER BY "issuedAt" ASC`
    );
    return (result.rows as Record<string, unknown>[]).map(mapToken);
  },
};
