import {
  broadcastRealtime,
  bumpStoreVersion,
  createEntityId,
  getStore,
} from "@/lib/db/demo-store";
import { getSqlPool, sql } from "@/lib/db/sqlserver";
import { formatCustomerCode, formatDisplayToken } from "@/lib/utils";
import { getBusinessDate, nowISO } from "@/lib/utils/date";
import type {
  Token,
  TokenEvent,
  TokenEventType,
  TokenStatus,
  TokenWithRelations,
} from "@/types";
import type { IResult, Transaction } from "mssql";
import {
  ENRICH_SELECT,
  TOKEN_ENRICH_FROM,
  mapEnrichedToken,
  mapToken,
  mapTokenEvent,
} from "./mappers";

const SETTINGS_ID = "settings_default";

type SqlRequest = ReturnType<Transaction["request"]>;

function notifyMutation(extra?: Record<string, unknown>) {
  bumpStoreVersion();
  broadcastRealtime({
    type: "QUEUE_UPDATED",
    payload: { ...extra, version: getStore().version },
    timestamp: nowISO(),
  });
}

async function withSqlTransaction<T>(
  fn: (tx: Transaction, req: () => SqlRequest) => Promise<T>
): Promise<T> {
  const pool = await getSqlPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(tx, () => new sql.Request(tx));
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
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
  req?: SqlRequest
): Promise<TokenWithRelations | null> {
  const request = req ?? (await getSqlPool()).request();
  const result = await request
    .input("id", sql.NVarChar(64), tokenId)
    .query(
      `SELECT TOP 1 ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t.id = @id`
    );
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  return row ? mapEnrichedToken(row) : null;
}

async function insertEvent(
  request: SqlRequest,
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
  await request
    .input("id", sql.NVarChar(64), createEntityId("evt"))
    .input("tokenId", sql.NVarChar(64), input.tokenId)
    .input("eventType", sql.NVarChar(32), input.eventType)
    .input("fromStatus", sql.NVarChar(32), input.fromStatus)
    .input("toStatus", sql.NVarChar(32), input.toStatus)
    .input("performedBy", sql.NVarChar(64), input.performedBy)
    .input("reason", sql.NVarChar(255), input.reason ?? null)
    .input(
      "metadata",
      sql.NVarChar(sql.MAX),
      input.metadata ? JSON.stringify(input.metadata) : null
    )
    .input("createdAt", sql.DateTime2, new Date())
    .query(
      `INSERT INTO dbo.token_events
        (id, tokenId, eventType, fromStatus, toStatus, performedBy, reason, metadata, createdAt)
       VALUES
        (@id, @tokenId, @eventType, @fromStatus, @toStatus, @performedBy, @reason, @metadata, @createdAt)`
    );
}

async function completeTokenInTx(
  requestFactory: () => SqlRequest,
  tokenId: string,
  performedBy: string
): Promise<Token> {
  const findReq = requestFactory();
  const found = await findReq
    .input("id", sql.NVarChar(64), tokenId)
    .query(
      `SELECT TOP 1 *, CONVERT(varchar(10), businessDate, 23) AS businessDateStr
       FROM dbo.tokens WHERE id = @id`
    );
  const row = found.recordset[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("Token not found");
  const token = mapToken(row);
  if (token.status !== "CALLED" && token.status !== "IN_PROGRESS") {
    throw new Error("Only an active token can be completed");
  }

  const now = new Date();
  const updateReq = requestFactory();
  await updateReq
    .input("id", sql.NVarChar(64), tokenId)
    .input("completedAt", sql.DateTime2, now)
    .input("updatedAt", sql.DateTime2, now)
    .query(
      `UPDATE dbo.tokens SET
         status = N'COMPLETED',
         completedAt = @completedAt,
         updatedAt = @updatedAt
       WHERE id = @id`
    );

  await requestFactory()
    .input("vehicleId", sql.NVarChar(64), token.vehicleId)
    .input("updatedAt", sql.DateTime2, now)
    .query(
      `UPDATE dbo.vehicles SET
         status = N'AVAILABLE',
         updatedAt = @updatedAt
       WHERE id = @vehicleId AND status = N'IN_TEST_DRIVE'`
    );

  await insertEvent(requestFactory(), {
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
  requestFactory: () => SqlRequest,
  vehicleId: string,
  fromStatus: TokenStatus
) {
  if (fromStatus !== "CALLED" && fromStatus !== "IN_PROGRESS") return;
  await requestFactory()
    .input("vehicleId", sql.NVarChar(64), vehicleId)
    .input("updatedAt", sql.DateTime2, new Date())
    .query(
      `UPDATE dbo.vehicles SET
         status = N'AVAILABLE',
         updatedAt = @updatedAt
       WHERE id = @vehicleId AND status = N'IN_TEST_DRIVE'`
    );
}

export const tokenRepository = {
  withTransaction,

  async findById(id: string): Promise<Token | null> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .query(
        `SELECT TOP 1 *, CONVERT(varchar(10), businessDate, 23) AS businessDateStr
         FROM dbo.tokens WHERE id = @id`
      );
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapToken(row) : null;
  },

  async findEnrichedById(id: string): Promise<TokenWithRelations | null> {
    return enrichById(id);
  },

  async listByBusinessDate(
    businessDate?: string
  ): Promise<TokenWithRelations[]> {
    const date = businessDate ?? getBusinessDate();
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("businessDate", sql.Date, date)
      .query(
        `SELECT ${ENRICH_SELECT}
         ${TOKEN_ENRICH_FROM}
         WHERE t.businessDate = @businessDate
         ORDER BY t.issuedAt ASC`
      );
    return (result.recordset as Record<string, unknown>[]).map(mapEnrichedToken);
  },

  async listByStatus(
    status: TokenStatus | TokenStatus[],
    businessDate?: string
  ): Promise<TokenWithRelations[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const date = businessDate ?? getBusinessDate();
    const pool = await getSqlPool();
    const request = pool.request().input("businessDate", sql.Date, date);
    const placeholders = statuses.map((_, i) => {
      const name = `status${i}`;
      request.input(name, sql.NVarChar(32), statuses[i]);
      return `@${name}`;
    });
    const result = await request.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t.businessDate = @businessDate
         AND t.status IN (${placeholders.join(", ")})
       ORDER BY t.sequenceNumber ASC, t.issuedAt ASC`
    );
    return (result.recordset as Record<string, unknown>[]).map(mapEnrichedToken);
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
    const pool = await getSqlPool();
    const request = pool.request().input("businessDate", sql.Date, date);
    let counterFilter = "";
    if (counterId) {
      request.input("counterId", sql.NVarChar(64), counterId);
      counterFilter = "AND t.counterId = @counterId";
    }
    const result = await request.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t.businessDate = @businessDate
         AND t.status IN (N'CALLED', N'IN_PROGRESS')
         ${counterFilter}
       ORDER BY t.calledAt ASC, t.issuedAt ASC`
    );
    return (result.recordset as Record<string, unknown>[]).map(mapEnrichedToken);
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
    const pool = await getSqlPool();
    const request = pool.request().input("businessDate", sql.Date, date);
    let exclude = "";
    if (currentId) {
      request.input("currentId", sql.NVarChar(64), currentId);
      exclude = "AND t.id <> @currentId";
    }
    const result = await request.query(
      `SELECT TOP 1 ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE t.businessDate = @businessDate
         ${exclude}
         AND t.status IN (N'COMPLETED', N'CALLED', N'IN_PROGRESS')
       ORDER BY COALESCE(t.calledAt, t.completedAt, t.issuedAt) DESC`
    );
    const row = result.recordset[0] as Record<string, unknown> | undefined;
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
    const pool = await getSqlPool();
    const request = pool.request();
    const where: string[] = ["1=1"];

    if (filters.businessDate) {
      request.input("businessDate", sql.Date, filters.businessDate);
      where.push("t.businessDate = @businessDate");
    }
    if (filters.status) {
      request.input("status", sql.NVarChar(32), filters.status);
      where.push("t.status = @status");
    }
    if (filters.vehicleId) {
      request.input("vehicleId", sql.NVarChar(64), filters.vehicleId);
      where.push("t.vehicleId = @vehicleId");
    }
    if (filters.officerId) {
      request.input("officerId", sql.NVarChar(64), filters.officerId);
      where.push("(t.issuedBy = @officerId OR t.calledBy = @officerId)");
    }
    if (filters.search) {
      request.input("search", sql.NVarChar(191), `%${filters.search}%`);
      where.push(
        `(t.tokenNumber LIKE @search
          OR t.customerCode LIKE @search
          OR c.name LIKE @search
          OR c.contactNumber LIKE @search
          OR (v.brand + N' ' + v.model) LIKE @search)`
      );
    }

    const whereSql = where.join(" AND ");
    const countResult: IResult<{ total: number }> = await request.query(
      `SELECT COUNT(1) AS total
       ${TOKEN_ENRICH_FROM}
       WHERE ${whereSql}`
    );
    const total = Number(countResult.recordset[0]?.total ?? 0);

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const pageReq = pool.request();
    if (filters.businessDate) {
      pageReq.input("businessDate", sql.Date, filters.businessDate);
    }
    if (filters.status) {
      pageReq.input("status", sql.NVarChar(32), filters.status);
    }
    if (filters.vehicleId) {
      pageReq.input("vehicleId", sql.NVarChar(64), filters.vehicleId);
    }
    if (filters.officerId) {
      pageReq.input("officerId", sql.NVarChar(64), filters.officerId);
    }
    if (filters.search) {
      pageReq.input("search", sql.NVarChar(191), `%${filters.search}%`);
    }
    pageReq.input("offset", sql.Int, offset);
    pageReq.input("pageSize", sql.Int, pageSize);

    const result = await pageReq.query(
      `SELECT ${ENRICH_SELECT}
       ${TOKEN_ENRICH_FROM}
       WHERE ${whereSql}
       ORDER BY t.issuedAt DESC
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`
    );

    return {
      items: (result.recordset as Record<string, unknown>[]).map(
        mapEnrichedToken
      ),
      total,
    };
  },

  async listEvents(tokenId: string): Promise<TokenEvent[]> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("tokenId", sql.NVarChar(64), tokenId)
      .query(
        `SELECT * FROM dbo.token_events
         WHERE tokenId = @tokenId
         ORDER BY createdAt ASC`
      );
    return (result.recordset as Record<string, unknown>[]).map(mapTokenEvent);
  },

  async createToken(input: {
    customerId: string;
    vehicleId: string;
    testDriveType: Token["testDriveType"];
    notes?: string | null;
    counterId?: string | null;
    issuedBy: string;
  }): Promise<TokenWithRelations> {
    const tokenId = await withSqlTransaction(async (_tx, req) => {
      const settingsResult = await req()
        .input("settingsId", sql.NVarChar(64), SETTINGS_ID)
        .query(
          `SELECT TOP 1 * FROM dbo.settings WITH (UPDLOCK, ROWLOCK)
           WHERE id = @settingsId`
        );
      const settingsRow = settingsResult.recordset[0] as
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

      const inUseResult = await req()
        .input("businessDate", sql.Date, businessDate)
        .query(
          `SELECT sequenceNumber FROM dbo.tokens
           WHERE businessDate = @businessDate
             AND status IN (N'WAITING', N'CALLED', N'IN_PROGRESS')`
        );
      const inUse = new Set<number>(
        (inUseResult.recordset as Array<{ sequenceNumber: number }>).map(
          (row) => Number(row.sequenceNumber)
        )
      );

      const nextSequence = nextQueueNumber(lastQueue, start, max, inUse);
      const nextCustomerSeq = lastCustomerCode + 1;
      const tokenNumber = formatDisplayToken(nextSequence);
      const customerCode = formatCustomerCode(prefix, nextCustomerSeq);
      const counterId = input.counterId ?? defaultCounterId;
      const now = new Date();
      const id = createEntityId("tok");

      const dup = await req()
        .input("customerCode", sql.NVarChar(30), customerCode)
        .query(
          `SELECT TOP 1 id FROM dbo.tokens WHERE customerCode = @customerCode`
        );
      if (dup.recordset[0]) {
        throw new Error("Duplicate customer code generated");
      }

      await req()
        .input("settingsId", sql.NVarChar(64), SETTINGS_ID)
        .input("lastQueueSequence", sql.Int, nextSequence)
        .input("lastCustomerCodeSequence", sql.Int, nextCustomerSeq)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `UPDATE dbo.settings SET
             lastQueueSequence = @lastQueueSequence,
             lastCustomerCodeSequence = @lastCustomerCodeSequence,
             updatedAt = @updatedAt
           WHERE id = @settingsId`
        );

      const seqId = createEntityId("seq");
      await req()
        .input("seqId", sql.NVarChar(64), seqId)
        .input("businessDate", sql.Date, businessDate)
        .input("prefix", sql.NVarChar(20), "QUEUE")
        .input("lastSequence", sql.Int, nextSequence)
        .query(
          `MERGE dbo.daily_sequences AS t
           USING (SELECT @businessDate AS businessDate, @prefix AS prefix) AS s
             ON t.businessDate = s.businessDate AND t.prefix = s.prefix
           WHEN MATCHED THEN UPDATE SET lastSequence = @lastSequence
           WHEN NOT MATCHED THEN INSERT (id, businessDate, prefix, lastSequence, counterId)
             VALUES (@seqId, @businessDate, @prefix, @lastSequence, NULL);`
        );

      await req()
        .input("id", sql.NVarChar(64), id)
        .input("tokenNumber", sql.NVarChar(20), tokenNumber)
        .input("tokenPrefix", sql.NVarChar(10), "")
        .input("sequenceNumber", sql.Int, nextSequence)
        .input("customerCode", sql.NVarChar(30), customerCode)
        .input("businessDate", sql.Date, businessDate)
        .input("customerId", sql.NVarChar(64), input.customerId)
        .input("vehicleId", sql.NVarChar(64), input.vehicleId)
        .input("testDriveType", sql.NVarChar(32), input.testDriveType)
        .input("status", sql.NVarChar(32), "WAITING")
        .input("counterId", sql.NVarChar(64), counterId)
        .input("issuedBy", sql.NVarChar(64), input.issuedBy)
        .input("notes", sql.NVarChar(sql.MAX), input.notes ?? null)
        .input("issuedAt", sql.DateTime2, now)
        .input("createdAt", sql.DateTime2, now)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `INSERT INTO dbo.tokens (
             id, tokenNumber, tokenPrefix, sequenceNumber, customerCode, businessDate,
             customerId, vehicleId, testDriveType, status, counterId, issuedBy, calledBy,
             notes, skipReason, cancellationReason, cancelledBy,
             issuedAt, calledAt, startedAt, completedAt, skippedAt, cancelledAt,
             recallCount, lastRecalledAt, createdAt, updatedAt
           ) VALUES (
             @id, @tokenNumber, @tokenPrefix, @sequenceNumber, @customerCode, @businessDate,
             @customerId, @vehicleId, @testDriveType, @status, @counterId, @issuedBy, NULL,
             @notes, NULL, NULL, NULL,
             @issuedAt, NULL, NULL, NULL, NULL, NULL,
             0, NULL, @createdAt, @updatedAt
           )`
        );

      await insertEvent(req(), {
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
    const tokenId = await withSqlTransaction(async (_tx, req) => {
      const settingsResult = await req()
        .input("settingsId", sql.NVarChar(64), SETTINGS_ID)
        .query(
          `SELECT TOP 1 defaultCounterId FROM dbo.settings WHERE id = @settingsId`
        );
      const defaultCounterId = String(
        (settingsResult.recordset[0] as Record<string, unknown> | undefined)
          ?.defaultCounterId ?? ""
      );
      const counterId = input.counterId ?? defaultCounterId;
      const businessDate = getBusinessDate();
      const maxConcurrent = Math.max(1, input.maxConcurrent || 6);

      const activeResult = await req()
        .input("businessDate", sql.Date, businessDate)
        .query(
          `SELECT id, vehicleId, status FROM dbo.tokens WITH (UPDLOCK, ROWLOCK)
           WHERE businessDate = @businessDate
             AND status IN (N'CALLED', N'IN_PROGRESS')
           ORDER BY calledAt ASC, issuedAt ASC`
        );
      let activeRows = activeResult.recordset as {
        id: string;
        vehicleId: string;
        status: TokenStatus;
      }[];

      if (activeRows.length >= maxConcurrent) {
        if (!input.autoComplete) {
          throw new Error(
            `All ${maxConcurrent} test drive slots are full. Complete a drive before calling the next customer.`
          );
        }
        await completeTokenInTx(req, activeRows[0].id, input.performedBy);
        activeRows = activeRows.slice(1);
      }

      const busyVehicleIds = new Set(
        activeRows
          .filter((r) => r.vehicleId !== "veh_unspecified")
          .map((r) => r.vehicleId)
      );

      let next: { id: string; status: TokenStatus; vehicleId: string } | undefined;

      if (input.tokenId) {
        const specificResult = await req()
          .input("id", sql.NVarChar(64), input.tokenId)
          .query(
            `SELECT TOP 1 id, status, vehicleId FROM dbo.tokens WITH (UPDLOCK, ROWLOCK)
             WHERE id = @id`
          );
        const specific = specificResult.recordset[0] as
          | { id: string; status: TokenStatus; vehicleId: string }
          | undefined;
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
        // Always prefer lowest waiting token number; skip only if that vehicle is busy
        const waitingResult = await req()
          .input("businessDate", sql.Date, businessDate)
          .input("counterId", sql.NVarChar(64), counterId)
          .query(
            `SELECT id, status, vehicleId, sequenceNumber FROM dbo.tokens WITH (UPDLOCK, ROWLOCK)
             WHERE businessDate = @businessDate
               AND status = N'WAITING'
               AND (counterId IS NULL OR counterId = @counterId)
             ORDER BY sequenceNumber ASC, issuedAt ASC`
          );
        const waiting = waitingResult.recordset as {
          id: string;
          status: TokenStatus;
          vehicleId: string;
          sequenceNumber: number;
        }[];
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
      await req()
        .input("id", sql.NVarChar(64), next.id)
        .input("calledBy", sql.NVarChar(64), input.performedBy)
        .input("counterId", sql.NVarChar(64), counterId)
        .input("calledAt", sql.DateTime2, now)
        .input("startedAt", sql.DateTime2, now)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `UPDATE dbo.tokens SET
             status = N'IN_PROGRESS',
             calledBy = @calledBy,
             calledAt = @calledAt,
             startedAt = @startedAt,
             counterId = @counterId,
             updatedAt = @updatedAt
           WHERE id = @id`
        );

      await req()
        .input("vehicleId", sql.NVarChar(64), next.vehicleId)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `UPDATE dbo.vehicles SET
             status = N'IN_TEST_DRIVE',
             updatedAt = @updatedAt
           WHERE id = @vehicleId`
        );

      await insertEvent(req(), {
        tokenId: next.id,
        eventType: "CALLED",
        fromStatus,
        toStatus: "CALLED",
        performedBy: input.performedBy,
      });
      await insertEvent(req(), {
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
    return withSqlTransaction(async (_tx, req) =>
      completeTokenInTx(req, tokenId, performedBy)
    );
  },

  async complete(
    tokenId: string,
    performedBy: string
  ): Promise<TokenWithRelations> {
    await withSqlTransaction(async (_tx, req) => {
      await completeTokenInTx(req, tokenId, performedBy);
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
    await withSqlTransaction(async (_tx, req) => {
      const found = await req()
        .input("id", sql.NVarChar(64), tokenId)
        .query(
          `SELECT TOP 1 id, status, recallCount FROM dbo.tokens WITH (UPDLOCK, ROWLOCK)
           WHERE id = @id`
        );
      const row = found.recordset[0] as
        | { id: string; status: TokenStatus; recallCount: number }
        | undefined;
      if (!row) throw new Error("Token not found");
      if (row.status !== "CALLED" && row.status !== "IN_PROGRESS") {
        throw new Error("Only the active token can be recalled");
      }

      const now = new Date();
      const recallCount = Number(row.recallCount) + 1;
      await req()
        .input("id", sql.NVarChar(64), tokenId)
        .input("recallCount", sql.Int, recallCount)
        .input("lastRecalledAt", sql.DateTime2, now)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `UPDATE dbo.tokens SET
             recallCount = @recallCount,
             lastRecalledAt = @lastRecalledAt,
             updatedAt = @updatedAt
           WHERE id = @id`
        );

      getStore().recallVersion += 1;

      await insertEvent(req(), {
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
    await withSqlTransaction(async (_tx, req) => {
      const found = await req()
        .input("id", sql.NVarChar(64), input.tokenId)
        .query(
          `SELECT TOP 1 id, status, vehicleId FROM dbo.tokens WITH (UPDLOCK, ROWLOCK)
           WHERE id = @id`
        );
      const row = found.recordset[0] as
        | { id: string; status: TokenStatus; vehicleId: string }
        | undefined;
      if (!row) throw new Error("Token not found");
      if (
        row.status !== "WAITING" &&
        row.status !== "CALLED" &&
        row.status !== "IN_PROGRESS"
      ) {
        throw new Error("This token cannot be skipped");
      }

      const now = new Date();
      await req()
        .input("id", sql.NVarChar(64), input.tokenId)
        .input("skipReason", sql.NVarChar(255), input.reason ?? null)
        .input("skippedAt", sql.DateTime2, now)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `UPDATE dbo.tokens SET
             status = N'SKIPPED',
             skipReason = @skipReason,
             skippedAt = @skippedAt,
             updatedAt = @updatedAt
           WHERE id = @id`
        );

      await releaseVehicleIfActive(req, row.vehicleId, row.status);

      await insertEvent(req(), {
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
    await withSqlTransaction(async (_tx, req) => {
      const found = await req()
        .input("id", sql.NVarChar(64), input.tokenId)
        .query(
          `SELECT TOP 1 id, status, vehicleId FROM dbo.tokens WITH (UPDLOCK, ROWLOCK)
           WHERE id = @id`
        );
      const row = found.recordset[0] as
        | { id: string; status: TokenStatus; vehicleId: string }
        | undefined;
      if (!row) throw new Error("Token not found");
      if (row.status === "COMPLETED" || row.status === "CANCELLED") {
        throw new Error("This token cannot be cancelled");
      }

      const now = new Date();
      await req()
        .input("id", sql.NVarChar(64), input.tokenId)
        .input("cancellationReason", sql.NVarChar(255), input.reason ?? null)
        .input("cancelledBy", sql.NVarChar(64), input.performedBy)
        .input("cancelledAt", sql.DateTime2, now)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `UPDATE dbo.tokens SET
             status = N'CANCELLED',
             cancellationReason = @cancellationReason,
             cancelledBy = @cancelledBy,
             cancelledAt = @cancelledAt,
             updatedAt = @updatedAt
           WHERE id = @id`
        );

      await releaseVehicleIfActive(req, row.vehicleId, row.status);

      await insertEvent(req(), {
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
    const pool = await getSqlPool();
    const result = await pool.request().query(
      `SELECT *, CONVERT(varchar(10), businessDate, 23) AS businessDateStr
       FROM dbo.tokens
       ORDER BY issuedAt ASC`
    );
    return (result.recordset as Record<string, unknown>[]).map(mapToken);
  },
};
