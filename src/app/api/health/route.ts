import { NextResponse } from "next/server";
import { isDurableStoreEnabled } from "@/lib/db/durable-store";
import { getSqlPool, isSqlServerEnabled } from "@/lib/db/sqlserver";

export const dynamic = "force-dynamic";

export async function GET() {
  const sqlEnabled = isSqlServerEnabled();
  const durable = isDurableStoreEnabled();

  if (!sqlEnabled) {
    return NextResponse.json({
      ok: durable || !process.env.VERCEL,
      mode: durable ? "durable" : "demo",
      database: null,
      durable,
      message: durable
        ? "Shared Redis store is enabled. Tokens persist across Vercel instances."
        : process.env.VERCEL
          ? "Vercel is using in-memory storage. Add KV_REST_API_URL and KV_REST_API_TOKEN (Vercel Storage → KV) or tokens will reset."
          : "In-memory store (local). Set DB_* for SQL Server, or KV_* for a shared store.",
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SQL Server connection failed";
    return NextResponse.json(
      {
        ok: false,
        mode: "sqlserver",
        server: process.env.DB_SERVER ?? null,
        database: process.env.DB_NAME ?? null,
        error: message,
        durable,
      },
      { status: 503 }
    );
  }
}
