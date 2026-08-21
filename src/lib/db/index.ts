/**
 * Database layer entry.
 *
 * DEMO MODE (NEXT_PUBLIC_ENABLE_DEMO_MODE=true):
 *   Uses `demo-store.ts` + in-memory repositories under `/repositories`.
 *
 * SQL SERVER MODE (NEXT_PUBLIC_ENABLE_DEMO_MODE=false, or DB_* set):
 *   Uses `sqlserver.ts` + `/repositories/mssql` implementations.
 *   On the server run `npm run db:prepare` once, then `npm start`.
 *
 * UI and services must not import SQL drivers directly — use repositories.
 */

export { getStore, IS_DEMO_MODE, resetDemoStore, bumpStoreVersion, broadcastRealtime } from "./demo-store";
export { getSqlPool, isSqlServerEnabled, sql } from "./sqlserver";
