"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/feedback";
import {
  ActiveDrivesPanel,
  CompletedTodayPanel,
  WaitingQueuePanel,
} from "@/components/queue/queue-panels";
import { useQueueState } from "@/hooks/useQueueState";
import Link from "next/link";

export default function AdminPage() {
  return (
    <DashboardShellClient allowedRoles={["ADMIN"]}>
      <AdminDashboard />
    </DashboardShellClient>
  );
}

function AdminDashboard() {
  const { snapshot, stats, loading } = useQueueState({ enableStats: true });
  const [users, setUsers] = useState<
    { id: string; name: string; email: string; role: string }[]
  >([]);

  useEffect(() => {
    void fetch("/api/users")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setUsers(json.data);
      });
  }, []);

  async function resetDemo() {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RESET_DEMO" }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success("Demo store reset");
      window.location.reload();
    } else {
      toast.error(json.error || "Reset failed");
    }
  }

  if (loading && !stats) return <PageLoader />;

  const maxConcurrent = snapshot?.maxConcurrentActive ?? 6;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
            Administration
          </p>
          <h1 className="font-display text-3xl font-bold">System Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Live waiting list and up to {maxConcurrent} concurrent test drives
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/display" target="_blank">
              Open Display
            </Link>
          </Button>
          <Button asChild>
            <Link href="/queue">Queue Control</Link>
          </Button>
          <Button variant="destructive" onClick={() => void resetDemo()}>
            Reset Demo Data
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Issued Today" value={stats?.issued ?? 0} />
        <StatCard label="Waiting" value={stats?.waiting ?? 0} accent="amber" />
        <StatCard
          label="In Progress"
          value={`${stats?.inProgress ?? 0}/${maxConcurrent}`}
          accent="blue"
        />
        <StatCard
          label="Completed"
          value={stats?.completed ?? 0}
          accent="green"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3 space-y-6">
          <ActiveDrivesPanel
            activeTokens={snapshot?.activeTokens ?? []}
            activeCount={snapshot?.activeCount ?? 0}
            maxConcurrent={maxConcurrent}
            interactive={false}
          />
          <WaitingQueuePanel
            waitingTokens={snapshot?.waitingTokens ?? []}
            showNavigateLink
          />
        </div>
        <div className="space-y-6 xl:col-span-2">
          <CompletedTodayPanel
            completedTokens={snapshot?.completedTokens ?? []}
            limit={10}
          />
          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["/tokens", "Issue Tokens"],
                ["/queue", "Queue Control"],
                ["/history", "Token History"],
                ["/vehicles", "Manage Vehicles"],
                ["/reports", "Reports"],
                ["/settings", "Settings"],
              ].map(([href, label]) => (
                <Button
                  key={href}
                  asChild
                  variant="secondary"
                  className="justify-start"
                >
                  <Link href={href}>{label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Officers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-[var(--muted)]">{u.email}</p>
                  </div>
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    {u.role}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
