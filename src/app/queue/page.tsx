"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageLoader } from "@/components/ui/feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ActiveDrivesPanel,
  CompletedTodayPanel,
  WaitingQueuePanel,
} from "@/components/queue/queue-panels";
import { queueAction, useQueueState } from "@/hooks/useQueueState";
import { CANCEL_REASONS, FLOOR_ROLES, SKIP_REASONS } from "@/lib/constants";

export default function QueuePage() {
  return (
    <DashboardShellClient allowedRoles={FLOOR_ROLES}>
      <QueueControl />
    </DashboardShellClient>
  );
}

function QueueControl() {
  const { snapshot, stats, loading, refresh } = useQueueState({
    enableStats: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [skipReason, setSkipReason] = useState<string>(SKIP_REASONS[0]);
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASONS[0]);
  const [targetTokenId, setTargetTokenId] = useState<string | null>(null);

  async function run(
    key: string,
    action: "NEXT" | "COMPLETE" | "RECALL" | "SKIP" | "CANCEL",
    body?: Record<string, unknown>
  ) {
    setBusy(key);
    try {
      await queueAction(action, body);
      toast.success(
        action === "NEXT"
          ? "Token called"
          : action === "COMPLETE"
            ? "Token completed"
            : action === "RECALL"
              ? "Token recalled"
              : action === "SKIP"
                ? "Token skipped"
                : "Token cancelled"
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !snapshot) {
    return <PageLoader label="Loading queue control..." />;
  }

  const activeTokens = snapshot?.activeTokens ?? [];
  const maxConcurrent = snapshot?.maxConcurrentActive ?? 6;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
          Indra Traders
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Test Drive Queue Control
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Up to {maxConcurrent} vehicles can run test drives at the same time.
          Call, complete, recall, skip or cancel from here.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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
        <StatCard
          label="Avg Wait"
          value={
            stats?.averageWaitingMinutes != null
              ? `${stats.averageWaitingMinutes}m`
              : "—"
          }
          accent="default"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <ActiveDrivesPanel
            activeTokens={activeTokens}
            activeCount={snapshot?.activeCount ?? activeTokens.length}
            maxConcurrent={maxConcurrent}
            busy={busy}
            onComplete={(tokenId) =>
              void run(`complete-${tokenId}`, "COMPLETE", { tokenId })
            }
            onRecall={(tokenId) =>
              void run(`recall-${tokenId}`, "RECALL", { tokenId })
            }
            onSkip={(tokenId) => {
              setTargetTokenId(tokenId);
              setSkipOpen(true);
            }}
            onCancel={(tokenId) => {
              setTargetTokenId(tokenId);
              setCancelOpen(true);
            }}
            onCallNext={() => void run("next", "NEXT")}
          />
        </div>

        <div className="space-y-6 xl:col-span-2">
          <WaitingQueuePanel
            waitingTokens={snapshot?.waitingTokens ?? []}
            busy={busy}
            interactive
            onCall={(tokenId) =>
              void run(`call-${tokenId}`, "NEXT", { tokenId })
            }
            onSkip={(tokenId) => {
              setTargetTokenId(tokenId);
              setSkipOpen(true);
            }}
            onCancel={(tokenId) => {
              setTargetTokenId(tokenId);
              setCancelOpen(true);
            }}
          />
          <CompletedTodayPanel
            completedTokens={snapshot?.completedTokens ?? []}
            limit={8}
          />
        </div>
      </div>

      <AlertDialog open={skipOpen} onOpenChange={setSkipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip this token?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer will be marked as skipped and removed from the active
              queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={skipReason} onValueChange={setSkipReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKIP_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!targetTokenId) return;
                void run("skip", "SKIP", {
                  tokenId: targetTokenId,
                  reason: skipReason,
                });
              }}
            >
              Confirm Skip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this token?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelled tokens cannot be called again. This action is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={cancelReason} onValueChange={setCancelReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Token</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--danger)] hover:bg-[var(--danger-hover)]"
              onClick={() => {
                if (!targetTokenId) return;
                void run("cancel", "CANCEL", {
                  tokenId: targetTokenId,
                  reason: cancelReason,
                });
              }}
            >
              Confirm Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
