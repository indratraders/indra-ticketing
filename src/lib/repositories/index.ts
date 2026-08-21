import { isSqlServerEnabled } from "@/lib/db/sqlserver";
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

/**
 * Demo repos are sync; SQL Server repos are async. Callers already `await`
 * results, so both work at runtime. The public type is the async contract.
 */
function pick<T extends object>(mssql: T, demo: object): T {
  return (isSqlServerEnabled() ? mssql : demo) as T;
}

function proxyRepo<T extends object>(mssql: T, demo: object): T {
  return new Proxy(mssql, {
    get(_t, prop, receiver) {
      const repo = pick(mssql, demo);
      const value = Reflect.get(repo, prop, receiver);
      return typeof value === "function" ? value.bind(repo) : value;
    },
  });
}

/** Always resolve at call time so env changes apply after restart. */
export const userRepository = proxyRepo(mssqlUserRepository, demoUserRepository);
export const vehicleRepository = proxyRepo(
  mssqlVehicleRepository,
  demoVehicleRepository
);
export const customerRepository = proxyRepo(
  mssqlCustomerRepository,
  demoCustomerRepository
);
export const settingsRepository = proxyRepo(
  mssqlSettingsRepository,
  demoSettingsRepository
);
export const tokenRepository = proxyRepo(mssqlTokenRepository, demoTokenRepository);
