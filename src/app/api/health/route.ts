import { NextResponse } from "next/server";
import { getSqlPool, isSqlServerEnabled } from "@/lib/db/sqlserver";

export const dynamic = "force-dynamic";

export async function GET() {
  const sqlEnabled = isSqlServerEnabled();

  if (!sqlEnabled) {
    return NextResponse.json({
      ok: true,
      mode: "demo",
      database: null,
      message: "In-memory demo store. Set NEXT_PUBLIC_ENABLE_DEMO_MODE=false and DB_* to use SQL Server.",
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
      },
      { status: 503 }
    );
  }
}
