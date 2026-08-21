import { isSqlServerEnabled } from "@/lib/db/sqlserver";
import { isPostgresEnabled } from "@/lib/db/postgres";
import { runWithDurableStore } from "@/lib/db/durable-store";
import { userRepository as demoUserRepository } from "./userRepository";
import { vehicleRepository as demoVehicleRepository } from "./vehicleRepository";
import { customerRepository as demoCustomerRepository } from "./customerRepository";
import { settingsRepository as demoSettingsRepository } from "./settingsRepository";
import { tokenRepository as demoTokenRepository } from "./tokenRepository";
import { userRepository as mssqlUserRepository } from "./mssql/userRepository";
import { vehicleRepository as mssqlVehicleRepository } from "./mssql/vehicleRepository";
import { customerRepository as mssqlCustomerRepository } from "./mssql/customerRepository";
import { settingsRepository as mssqlSettingsRepository } from "./mssql/settingsRepository";
import { tokenRepository as mssqlTokenRepository } from "./mssql/tokenRepository";
import { userRepository as pgUserRepository } from "./postgres/userRepository";
import { vehicleRepository as pgVehicleRepository } from "./postgres/vehicleRepository";
import { customerRepository as pgCustomerRepository } from "./postgres/customerRepository";
import { settingsRepository as pgSettingsRepository } from "./postgres/settingsRepository";
import { tokenRepository as pgTokenRepository } from "./postgres/tokenRepository";

type Backend = "mssql" | "postgres" | "demo";

function backend(): Backend {
  if (isSqlServerEnabled()) return "mssql";
  if (isPostgresEnabled()) return "postgres";
  return "demo";
}

const MEMORY_ONLY = new Set(["getStoreVersion", "getRecallVersion"]);

function pickRepo<T extends object>(mssql: T, postgres: T, demo: object): T {
  const mode = backend();
  if (mode === "mssql") return mssql;
  if (mode === "postgres") return postgres;
  return demo as T;
}

function proxyRepo<T extends object>(mssql: T, postgres: T, demo: object): T {
  return new Proxy(mssql, {
    get(_t, prop, receiver) {
      const repo = pickRepo(mssql, postgres, demo);
      const value = Reflect.get(repo, prop, receiver);
      if (typeof value !== "function") return value;
      const bound = value.bind(repo) as (...args: unknown[]) => unknown;
      // JSON durable store only wraps the in-memory demo backend
      if (backend() !== "demo" || MEMORY_ONLY.has(String(prop))) {
        return bound;
      }
      return (...args: unknown[]) => runWithDurableStore(() => bound(...args));
    },
  });
}

/** Always resolve at call time so env changes apply after restart. */
export const userRepository = proxyRepo(
  mssqlUserRepository,
  pgUserRepository,
  demoUserRepository
);
export const vehicleRepository = proxyRepo(
  mssqlVehicleRepository,
  pgVehicleRepository,
  demoVehicleRepository
);
export const customerRepository = proxyRepo(
  mssqlCustomerRepository,
  pgCustomerRepository,
  demoCustomerRepository
);
export const settingsRepository = proxyRepo(
  mssqlSettingsRepository,
  pgSettingsRepository,
  demoSettingsRepository
);
export const tokenRepository = proxyRepo(
  mssqlTokenRepository,
  pgTokenRepository,
  demoTokenRepository
);
