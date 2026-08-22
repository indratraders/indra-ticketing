import { NextResponse } from "next/server";
import {
  durableStoreBackend,
  isDurableStoreEnabled,
} from "@/lib/db/durable-store";
import { isPostgresEnabled } from "@/lib/db/postgres";
import { isSupabaseRestEnabled, supabaseRest } from "@/lib/db/supabase-rest";
import { getSqlPool, isSqlServerEnabled } from "@/lib/db/sqlserver";

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
          (SELECT COUNT(*) FROM dbo.tokens) AS tokenCount,
          (SELECT COUNT(*) FROM dbo.settings) AS settingsCount
      `);
      const row = result.recordset[0] as {
        databaseName: string;
        userCount: number;
        vehicleCount: number;
        tokenCount: number;
        settingsCount: number;
      };
      return NextResponse.json({
        ok: true,
        mode: "sqlserver",
        server: process.env.DB_SERVER,
        database: row.databaseName,
        userCount: row.userCount,
        vehicleCount: row.vehicleCount,
        tokenCount: row.tokenCount,
        settingsReady: row.settingsCount > 0,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SQL Server connection failed";
      return NextResponse.json(
        {
          ok: false,
          mode: "sqlserver",
          error: message,
        },
        { status: 503 }
      );
    }
  }

  if (isPostgresEnabled() || isSupabaseRestEnabled()) {
    try {
      // Prefer REST health checks — avoid pg pool on the hot path
      if (isSupabaseRestEnabled()) {
        const [vehicles, users, tokens, settings] = await Promise.all([
          supabaseRest<unknown[]>("vehicles?active=eq.true&select=id"),
          supabaseRest<unknown[]>("users?select=id"),
          supabaseRest<unknown[]>("tokens?select=id"),
          supabaseRest<unknown[]>(
            "settings?id=eq.settings_default&select=id"
          ),
        ]);
        return NextResponse.json({
          ok: true,
          mode: "postgres",
          backend: "supabase-rest",
          database: process.env.POSTGRES_DATABASE || "postgres",
          userCount: users?.length ?? 0,
          vehicleCount: vehicles?.length ?? 0,
          tokenCount: tokens?.length ?? 0,
          settingsReady: (settings?.length ?? 0) > 0,
          message:
            "Supabase REST is active. Tokens and customers persist in relational tables.",
        });
      }

      return NextResponse.json({
        ok: true,
        mode: "postgres",
        backend: "supabase",
        message: "Postgres enabled",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Supabase connection failed";
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
      ? "JSON durable store (legacy)."
      : "In-memory demo store.",
  });
}
