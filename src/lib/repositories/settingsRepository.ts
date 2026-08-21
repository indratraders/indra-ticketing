import { createEntityId, getStore } from "@/lib/db/demo-store";
import { nowISO } from "@/lib/utils/date";
import type { Counter, SystemSettings } from "@/types";

/**
 * DEMO: settings & counters repository.
 * Replace with Prisma Settings/Counter models when MySQL is connected.
 */
export const settingsRepository = {
  get(): SystemSettings {
    return { ...getStore().settings };
  },

  update(partial: Partial<SystemSettings>): SystemSettings {
    const store = getStore();
    store.settings = {
      ...store.settings,
      ...partial,
      id: store.settings.id,
      updatedAt: nowISO(),
    };
    return { ...store.settings };
  },

  listCounters(activeOnly = true): Counter[] {
    const counters = getStore().counters;
    return activeOnly ? counters.filter((c) => c.active) : [...counters];
  },

  findCounterById(id: string): Counter | null {
    return getStore().counters.find((c) => c.id === id) ?? null;
  },

  findCounterByCode(code: string): Counter | null {
    return getStore().counters.find((c) => c.code === code) ?? null;
  },
};
