import { NextResponse } from "next/server";
import {
  durableStoreBackend,
  isDurableStoreEnabled,
} from "@/lib/db/durable-store";
import { getSqlPool, isSqlServerEnabled } from "@/lib/db/sqlserver";

export const dynamic = "force-dynamic";

export async function GET() {
  const sqlEnabled = isSqlServerEnabled();
  const durable = isDurableStoreEnabled();
  const backend = durableStoreBackend();

  if (!sqlEnabled) {
    const ok = durable || !process.env.VERCEL;
    return NextResponse.json({
      ok,
      mode: durable ? "durable" : "demo",
      backend,
      database: null,
      durable,
      message: durable
        ? backend === "supabase" || backend === "supabase-rest"
          ? "Shared Supabase store is enabled. Tokens persist across Vercel instances."
          : "Shared Redis store is enabled. Tokens persist across Vercel instances."
        : process.env.VERCEL
          ? "Vercel is using in-memory storage. Connect Supabase (POSTGRES_URL / SUPABASE_URL) or tokens will reset."
          : "In-memory store (local). Set DB_* for SQL Server, or Supabase for a shared store.",
    });
  }

  try {
    const pool = await getSqlPool();
    const result = await pool.request().query(`
      SELECT
        DB_NAME() AS databaseName,
        (SELECT COUNT(*) FROM dbo.users) AS userCount,
        (SELECT COUNT(*) FROM dbo.settings) AS settingsCount
    `);
    const row = result.recordset[0] as {
      databaseName: string;
      userCount: number;
      settingsCount: number;
    };

    return NextResponse.json({
      ok: true,
      mode: "sqlserver",
      server: process.env.DB_SERVER,
      database: row.databaseName,
      userCount: row.userCount,
      settingsReady: row.settingsCount > 0,
      durable: false,
      backend: null,
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
        durable,
        backend,
      },
      { status: 503 }
    );
  }
}
