import bcrypt from "bcryptjs";
import { DEMO_PASSWORD } from "@/lib/constants";
import { isSqlServerEnabled } from "@/lib/db/sqlserver";
import { getBusinessDate, nowISO } from "@/lib/utils/date";
import type {
  Counter,
  Customer,
  DailySequence,
  SystemSettings,
  Token,
  TokenEvent,
  User,
  Vehicle,
} from "@/types";

export interface DemoStore {
  users: User[];
  vehicles: Vehicle[];
  customers: Customer[];
  counters: Counter[];
  tokens: Token[];
  tokenEvents: TokenEvent[];
  dailySequences: DailySequence[];
  /** Continuous unique customer code counter → C0001, C0002, … */
  lastCustomerCodeSequence: number;
  /** Last issued queue display number in the 1–50 cycle */
  lastQueueSequence: number;
  settings: SystemSettings;
  recallVersion: number;
  version: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __indraDemoStore: DemoStore | undefined;
  // eslint-disable-next-line no-var
  var __indraRealtimeListeners: Set<(event: unknown) => void> | undefined;
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function createEntityId(prefix: string): string {
  return createId(prefix);
}

function seedStore(): DemoStore {
  const now = nowISO();
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const businessDate = getBusinessDate();

  const users: User[] = [
    {
      id: "user_admin",
      email: "admin@indra.local",
      name: "System Admin",
      passwordHash,
      role: "ADMIN",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_krish",
      email: "krish@indra.local",
      name: "Krish",
      passwordHash,
      role: "TOKEN_OFFICER",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_umesh",
      email: "umesh@indra.local",
      name: "Umesh",
      passwordHash,
      role: "TOKEN_OFFICER",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_imithiyaz",
      email: "imithiyaz@indra.local",
      name: "Imithiyaz",
      passwordHash,
      role: "TOKEN_OFFICER",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_buwaneka",
      email: "buwaneka@indra.local",
      name: "Buwaneka",
      passwordHash,
      role: "TOKEN_OFFICER",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "user_omith",
      email: "omith@indra.local",
      name: "Omith",
      passwordHash,
      role: "TOKEN_OFFICER",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const counters: Counter[] = [
    {
      id: "counter_01",
      name: "Counter 01",
      code: "1",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "counter_02",
      name: "Counter 02",
      code: "2",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // Vehicles for Test Drive - Colombo
  const vehicles: Vehicle[] = [
    {
      id: "veh_raptor",
      brand: "Ford",
      model: "Raptor",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "veh_vezel",
      brand: "Honda",
      model: "Vezel",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "veh_taisor",
      brand: "Toyota",
      model: "Taisor",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "veh_sonet",
      brand: "Kia",
      model: "Sonet",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "veh_raize",
      brand: "Toyota",
      model: "Raize",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "veh_dayz",
      brand: "Nissan",
      model: "Dayz",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const settings: SystemSettings = {
    id: "settings_default",
    companyName: "Indra Traders (PVT) LTD — Colombo",
    tokenPrefix: "",
    startingTokenNumber: 1,
    maxTokenNumber: 50,
    customerCodePrefix: "C",
    defaultCounterId: "counter_01",
    audioNotificationEnabled: true,
    textToSpeechEnabled: true,
    displayMode: "LARGE",
    queueBehavior: "FIFO",
    autoCompleteOnNext: false,
    upcomingTokensCount: 6,
    displayShowCustomerName: true,
    timezone: "Asia/Colombo",
    updatedAt: now,
  };

  return {
    users,
    vehicles,
    customers: [],
    counters,
    tokens: [],
    tokenEvents: [],
    dailySequences: [
      {
        id: "seq_today",
        businessDate,
        prefix: "QUEUE",
        lastSequence: 0,
        counterId: null,
      },
    ],
    lastCustomerCodeSequence: 0,
    lastQueueSequence: 0,
    settings,
    recallVersion: 0,
    version: 1,
  };
}

export function getStore(): DemoStore {
  if (!globalThis.__indraDemoStore) {
    globalThis.__indraDemoStore = seedStore();
    return globalThis.__indraDemoStore;
  }

  const store = globalThis.__indraDemoStore;
  // Older demo sessions used A-001 tokens — reseed for the 1–50 + C0001 scheme
  if (
    typeof store.lastCustomerCodeSequence !== "number" ||
    typeof store.settings.maxTokenNumber !== "number" ||
    !store.settings.customerCodePrefix
  ) {
    globalThis.__indraDemoStore = seedStore();
  }

  return globalThis.__indraDemoStore;
}

export function bumpStoreVersion(): number {
  const store = getStore();
  store.version += 1;
  return store.version;
}

export function getRealtimeListeners(): Set<(event: unknown) => void> {
  if (!globalThis.__indraRealtimeListeners) {
    globalThis.__indraRealtimeListeners = new Set();
  }
  return globalThis.__indraRealtimeListeners;
}

export function broadcastRealtime(event: unknown): void {
  const listeners = getRealtimeListeners();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // ignore broken listeners
    }
  }
}

export function resetDemoStore(): DemoStore {
  globalThis.__indraDemoStore = seedStore();
  bumpStoreVersion();
  broadcastRealtime({
    type: "QUEUE_UPDATED",
    payload: { reset: true },
    timestamp: nowISO(),
  });
  return globalThis.__indraDemoStore;
}

/**
 * DEMO MODE in-memory store.
 * SQL Server is used when NEXT_PUBLIC_ENABLE_DEMO_MODE=false or when DB_* is set.
 */
export const IS_DEMO_MODE = !isSqlServerEnabled();
