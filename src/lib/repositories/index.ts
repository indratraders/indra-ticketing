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

function pick<T>(mssql: T, demo: T): T {
  return isSqlServerEnabled() ? mssql : demo;
}

/** Always resolve at call time so env changes apply after restart. */
export const userRepository = new Proxy(mssqlUserRepository, {
  get(_t, prop, receiver) {
    const repo = pick(mssqlUserRepository, demoUserRepository);
    const value = Reflect.get(repo, prop, receiver);
    return typeof value === "function" ? value.bind(repo) : value;
  },
});

export const vehicleRepository = new Proxy(mssqlVehicleRepository, {
  get(_t, prop, receiver) {
    const repo = pick(mssqlVehicleRepository, demoVehicleRepository);
    const value = Reflect.get(repo, prop, receiver);
    return typeof value === "function" ? value.bind(repo) : value;
  },
});

export const customerRepository = new Proxy(mssqlCustomerRepository, {
  get(_t, prop, receiver) {
    const repo = pick(mssqlCustomerRepository, demoCustomerRepository);
    const value = Reflect.get(repo, prop, receiver);
    return typeof value === "function" ? value.bind(repo) : value;
  },
});

export const settingsRepository = new Proxy(mssqlSettingsRepository, {
  get(_t, prop, receiver) {
    const repo = pick(mssqlSettingsRepository, demoSettingsRepository);
    const value = Reflect.get(repo, prop, receiver);
    return typeof value === "function" ? value.bind(repo) : value;
  },
});

export const tokenRepository = new Proxy(mssqlTokenRepository, {
  get(_t, prop, receiver) {
    const repo = pick(mssqlTokenRepository, demoTokenRepository);
    const value = Reflect.get(repo, prop, receiver);
    return typeof value === "function" ? value.bind(repo) : value;
  },
});
