import { pgQuery, pgQueryOne } from "@/lib/db/postgres";
import { nowISO } from "@/lib/utils/date";
import type { Counter, SystemSettings } from "@/types";
import { mapCounter, mapSettings } from "../mssql/mappers";

const SETTINGS_ID = "settings_default";

export const settingsRepository = {
  async get(): Promise<SystemSettings> {
    const row = await pgQueryOne(
      `SELECT * FROM public.settings WHERE id = $1 LIMIT 1`,
      [SETTINGS_ID]
    );
    if (!row) {
      throw new Error(
        "System settings not found. Run scripts/setup-supabase.sql in Supabase."
      );
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

    await pgQuery(
      `UPDATE public.settings SET
         "companyName" = $2,
         "tokenPrefix" = $3,
         "startingTokenNumber" = $4,
         "maxTokenNumber" = $5,
         "customerCodePrefix" = $6,
         "defaultCounterId" = $7,
         "audioNotificationEnabled" = $8,
         "textToSpeechEnabled" = $9,
         "displayMode" = $10,
         "queueBehavior" = $11,
         "autoCompleteOnNext" = $12,
         "upcomingTokensCount" = $13,
         "displayShowCustomerName" = $14,
         timezone = $15,
         "updatedAt" = now()
       WHERE id = $1`,
      [
        next.id,
        next.companyName,
        next.tokenPrefix,
        next.startingTokenNumber,
        next.maxTokenNumber,
        next.customerCodePrefix,
        next.defaultCounterId,
        next.audioNotificationEnabled,
        next.textToSpeechEnabled,
        next.displayMode,
        next.queueBehavior,
        next.autoCompleteOnNext,
        next.upcomingTokensCount,
        next.displayShowCustomerName,
        next.timezone,
      ]
    );

    return next;
  },

  async listCounters(activeOnly = true): Promise<Counter[]> {
    const rows = activeOnly
      ? await pgQuery(
          `SELECT * FROM public.counters WHERE active = true ORDER BY code`
        )
      : await pgQuery(`SELECT * FROM public.counters ORDER BY code`);
    return rows.map(mapCounter);
  },

  async findCounterById(id: string): Promise<Counter | null> {
    const row = await pgQueryOne(
      `SELECT * FROM public.counters WHERE id = $1 LIMIT 1`,
      [id]
    );
    return row ? mapCounter(row) : null;
  },

  async findCounterByCode(code: string): Promise<Counter | null> {
    const row = await pgQueryOne(
      `SELECT * FROM public.counters WHERE code = $1 LIMIT 1`,
      [code]
    );
    return row ? mapCounter(row) : null;
  },
};
