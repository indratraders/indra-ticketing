import { getSqlPool, sql } from "@/lib/db/sqlserver";
import { nowISO } from "@/lib/utils/date";
import type { Counter, SystemSettings } from "@/types";
import { mapCounter, mapSettings } from "./mappers";

const SETTINGS_ID = "settings_default";

export const settingsRepository = {
  async get(): Promise<SystemSettings> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("id", sql.NVarChar(64), SETTINGS_ID)
      .query(`SELECT TOP 1 * FROM dbo.settings WHERE id = @id`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error("System settings not found. Run db:seed.");
    }
    return mapSettings(row);
  },

  async update(partial: Partial<SystemSettings>): Promise<SystemSettings> {
    const current = await this.get();
    const next: SystemSettings = {
      ...current,
      ...partial,
      id: current.id,
      updatedAt: nowISO(),
    };

    const pool = await getSqlPool();
    await pool
      .request()
      .input("id", sql.NVarChar(64), next.id)
      .input("companyName", sql.NVarChar(191), next.companyName)
      .input("tokenPrefix", sql.NVarChar(10), next.tokenPrefix)
      .input("startingTokenNumber", sql.Int, next.startingTokenNumber)
      .input("maxTokenNumber", sql.Int, next.maxTokenNumber)
      .input("customerCodePrefix", sql.NVarChar(10), next.customerCodePrefix)
      .input("defaultCounterId", sql.NVarChar(64), next.defaultCounterId)
      .input("audioNotificationEnabled", sql.Bit, next.audioNotificationEnabled)
      .input("textToSpeechEnabled", sql.Bit, next.textToSpeechEnabled)
      .input("displayMode", sql.NVarChar(20), next.displayMode)
      .input("queueBehavior", sql.NVarChar(20), next.queueBehavior)
      .input("autoCompleteOnNext", sql.Bit, next.autoCompleteOnNext)
      .input("upcomingTokensCount", sql.Int, next.upcomingTokensCount)
      .input("displayShowCustomerName", sql.Bit, next.displayShowCustomerName)
      .input("timezone", sql.NVarChar(64), next.timezone)
      .input("updatedAt", sql.DateTime2, new Date())
      .query(
        `UPDATE dbo.settings SET
           companyName = @companyName,
           tokenPrefix = @tokenPrefix,
           startingTokenNumber = @startingTokenNumber,
           maxTokenNumber = @maxTokenNumber,
           customerCodePrefix = @customerCodePrefix,
           defaultCounterId = @defaultCounterId,
           audioNotificationEnabled = @audioNotificationEnabled,
           textToSpeechEnabled = @textToSpeechEnabled,
           displayMode = @displayMode,
           queueBehavior = @queueBehavior,
           autoCompleteOnNext = @autoCompleteOnNext,
           upcomingTokensCount = @upcomingTokensCount,
           displayShowCustomerName = @displayShowCustomerName,
           timezone = @timezone,
           updatedAt = @updatedAt
         WHERE id = @id`
      );

    return next;
  },

  async listCounters(activeOnly = true): Promise<Counter[]> {
    const pool = await getSqlPool();
    const result = activeOnly
      ? await pool
          .request()
          .query(
            `SELECT * FROM dbo.counters WHERE active = 1 ORDER BY code`
          )
      : await pool
          .request()
          .query(`SELECT * FROM dbo.counters ORDER BY code`);
    return (result.recordset as Record<string, unknown>[]).map(mapCounter);
  },

  async findCounterById(id: string): Promise<Counter | null> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .query(`SELECT TOP 1 * FROM dbo.counters WHERE id = @id`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapCounter(row) : null;
  },

  async findCounterByCode(code: string): Promise<Counter | null> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("code", sql.NVarChar(20), code)
      .query(`SELECT TOP 1 * FROM dbo.counters WHERE code = @code`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapCounter(row) : null;
  },
};
