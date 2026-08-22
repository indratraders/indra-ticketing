import { isSupabaseRestEnabled, supabaseRest } from "@/lib/db/supabase-rest";
import { pgQuery, pgQueryOne } from "@/lib/db/postgres";
import { nowISO } from "@/lib/utils/date";
import type { Counter, SystemSettings } from "@/types";
import { mapCounter, mapSettings } from "../mssql/mappers";

const SETTINGS_ID = "settings_default";

export const settingsRepository = {
  async get(): Promise<SystemSettings> {
    if (isSupabaseRestEnabled()) {
      try {
        const rows = await supabaseRest<Record<string, unknown>[]>(
          `settings?id=eq.${encodeURIComponent(SETTINGS_ID)}&select=*&limit=1`
        );
        if (rows?.[0]) return mapSettings(rows[0]);
      } catch {
        // fall through
      }
    }
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

    const body = {
      companyName: next.companyName,
      tokenPrefix: next.tokenPrefix,
      startingTokenNumber: next.startingTokenNumber,
      maxTokenNumber: next.maxTokenNumber,
      customerCodePrefix: next.customerCodePrefix,
      defaultCounterId: next.defaultCounterId,
      audioNotificationEnabled: next.audioNotificationEnabled,
      textToSpeechEnabled: next.textToSpeechEnabled,
      displayMode: next.displayMode,
      queueBehavior: next.queueBehavior,
      autoCompleteOnNext: next.autoCompleteOnNext,
      upcomingTokensCount: next.upcomingTokensCount,
      displayShowCustomerName: next.displayShowCustomerName,
      timezone: next.timezone,
    };

    if (isSupabaseRestEnabled()) {
      await supabaseRest(
        `settings?id=eq.${encodeURIComponent(next.id)}`,
        {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify(body),
        }
      );
      return next;
    }

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
    if (isSupabaseRestEnabled()) {
      try {
        const filter = activeOnly ? "&active=eq.true" : "";
        const rows = await supabaseRest<Record<string, unknown>[]>(
          `counters?select=*&order=code.asc${filter}`
        );
        return (rows || []).map(mapCounter);
      } catch {
        // fall through
      }
    }
    const rows = activeOnly
      ? await pgQuery(
          `SELECT * FROM public.counters WHERE active = true ORDER BY code`
        )
      : await pgQuery(`SELECT * FROM public.counters ORDER BY code`);
    return rows.map(mapCounter);
  },

  async findCounterById(id: string): Promise<Counter | null> {
    if (isSupabaseRestEnabled()) {
      try {
        const rows = await supabaseRest<Record<string, unknown>[]>(
          `counters?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
        );
        return rows?.[0] ? mapCounter(rows[0]) : null;
      } catch {
        // fall through
      }
    }
    const row = await pgQueryOne(
      `SELECT * FROM public.counters WHERE id = $1 LIMIT 1`,
      [id]
    );
    return row ? mapCounter(row) : null;
  },

  async findCounterByCode(code: string): Promise<Counter | null> {
    if (isSupabaseRestEnabled()) {
      try {
        const rows = await supabaseRest<Record<string, unknown>[]>(
          `counters?code=eq.${encodeURIComponent(code)}&select=*&limit=1`
        );
        return rows?.[0] ? mapCounter(rows[0]) : null;
      } catch {
        // fall through
      }
    }
    const row = await pgQueryOne(
      `SELECT * FROM public.counters WHERE code = $1 LIMIT 1`,
      [code]
    );
    return row ? mapCounter(row) : null;
  },
};
