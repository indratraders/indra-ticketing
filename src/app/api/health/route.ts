import { NextResponse } from "next/server";
import {
  durableStoreBackend,
  isDurableStoreEnabled,
} from "@/lib/db/durable-store";
import { isPostgresEnabled } from "@/lib/db/postgres";
import { getSqlPool, isSqlServerEnabled } from "@/lib/db/sqlserver";
import { pgQueryOne } from "@/lib/db/postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isSqlServerEnabled()) {
    try {
      const pool = await getSqlPool();
      const result = await pool.request().query(`
        SELECT
          DB_NAME() AS databaseName,
          (SELECT COUNT(*) FROM dbo.users) AS userCount,
          (SELECT COUNT(*) FROM dbo.vehicles) AS vehicleCount,
          (SELECT COUNT(*) FROM dbo.settings) AS settingsCount
      `);
      const row = result.recordset[0] as {
        databaseName: string;
        userCount: number;
        vehicleCount: number;
        settingsCount: number;
      };
      return NextResponse.json({
        ok: true,
        mode: "sqlserver",
        server: process.env.DB_SERVER,
        database: row.databaseName,
        userCount: row.userCount,
        vehicleCount: row.vehicleCount,
        settingsReady: row.settingsCount > 0,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SQL Server connection failed";
      return NextResponse.json(
        {
          ok: false,
          mode: "sqlserver",
          server: process.env.DB_SERVER ?? null,
          database: process.env.DB_NAME ?? null,
          error: message,
        },
        { status: 503 }
      );
    }
  }

  if (isPostgresEnabled()) {
    try {
      const vehicles = await pgQueryOne<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM public.vehicles WHERE active = true`
      );
      const users = await pgQueryOne<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM public.users`
      );
      const settings = await pgQueryOne<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM public.settings`
      );
      return NextResponse.json({
        ok: true,
        mode: "postgres",
        backend: "supabase",
        database: process.env.POSTGRES_DATABASE || "postgres",
        userCount: Number(users?.n || 0),
        vehicleCount: Number(vehicles?.n || 0),
        settingsReady: Number(settings?.n || 0) > 0,
        message:
          Number(vehicles?.n || 0) > 0
            ? "Supabase relational tables are ready (vehicles, users, tokens)."
            : "Supabase connected but vehicles table is empty. Run scripts/setup-supabase.sql.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Postgres connection failed";
      return NextResponse.json(
        {
          ok: false,
          mode: "postgres",
          backend: "supabase",
          error: message,
          hint: "Run scripts/setup-supabase.sql in the Supabase SQL editor.",
        },
        { status: 503 }
      );
    }
  }

  const durable = isDurableStoreEnabled();
  const backend = durableStoreBackend();
  return NextResponse.json({
    ok: durable || !process.env.VERCEL,
    mode: durable ? "durable" : "demo",
    backend,
    durable,
    message: durable
      ? "JSON durable store (legacy). Prefer running setup-supabase.sql for real tables."
      : "In-memory demo store.",
  });
}
