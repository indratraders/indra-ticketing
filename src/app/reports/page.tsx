"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageLoader } from "@/components/ui/feedback";
import { FLOOR_ROLES } from "@/lib/constants";
import type { ReportSummary } from "@/types";

export default function ReportsPage() {
  return (
    <DashboardShellClient allowedRoles={FLOOR_ROLES}>
      <ReportsView />
    </DashboardShellClient>
  );
}

function ReportsView() {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/reports?days=7")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setReport(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !report) return <PageLoader label="Loading reports..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Last 7 days of showroom queue activity
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Completed" value={report.completed} accent="green" />
        <StatCard label="Cancelled" value={report.cancelled} accent="rose" />
        <StatCard
          label="Avg Waiting"
          value={
            report.averageWaitingMinutes != null
              ? `${report.averageWaitingMinutes}m`
              : "—"
          }
        />
        <StatCard
          label="Avg Test Drive"
          value={
            report.averageTestDriveMinutes != null
              ? `${report.averageTestDriveMinutes}m`
              : "—"
          }
          accent="blue"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Daily Token Count" data={report.dailyTokenCount} xKey="date" yKey="count" />
        <ChartCard title="Hourly Queue Volume" data={report.hourlyVolume} xKey="hour" yKey="count" />
        <ChartCard title="Vehicle-wise Test Drives" data={report.vehicleWise} xKey="vehicle" yKey="count" />
        <Card>
          <CardHeader>
            <CardTitle>Officer Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.officerActivity.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No activity yet.</p>
            ) : (
              report.officerActivity.map((row) => (
                <div
                  key={row.officer}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <span className="font-medium">{row.officer}</span>
                  <span className="text-[var(--muted)]">
                    Issued {row.issued} · Called {row.called}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  xKey,
  yKey,
}: {
  title: string;
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No data available yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey={yKey} fill="#0c4a6e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
