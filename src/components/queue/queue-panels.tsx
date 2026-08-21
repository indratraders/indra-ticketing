"use client";

import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  Inbox,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { vehicleDisplayName } from "@/lib/utils";
import type { TokenWithRelations } from "@/types";

type BusyKey = string | null;

export function ActiveDrivesPanel({
  activeTokens,
  activeCount,
  maxConcurrent,
  busy,
  interactive = true,
  onComplete,
  onRecall,
  onSkip,
  onCancel,
  onCallNext,
}: {
  activeTokens: TokenWithRelations[];
  activeCount: number;
  maxConcurrent: number;
  busy?: BusyKey;
  interactive?: boolean;
  onComplete?: (tokenId: string) => void;
  onRecall?: (tokenId: string) => void;
  onSkip?: (tokenId: string) => void;
  onCancel?: (tokenId: string) => void;
  onCallNext?: () => void;
}) {
  const slotsFull = activeCount >= maxConcurrent;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-[var(--sidebar)] text-white">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <CardTitle className="text-white">Active Test Drives</CardTitle>
          <p className="text-sm text-white/70">
            {activeCount} / {maxConcurrent} slots
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {activeTokens.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeTokens.map((token) => (
              <div
                key={token.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-3xl font-bold tracking-tight">
                    {token.tokenNumber}
                  </p>
                  <StatusBadge status={token.status} />
                </div>
                <p className="mt-2 text-sm font-medium">{token.customer.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {vehicleDisplayName(token.vehicle.brand, token.vehicle.model)}
                </p>
                {interactive ? (
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busy !== null}
                      onClick={() => onComplete?.(token.id)}
                    >
                      {busy === `complete-${token.id}` ? (
                        <Spinner className="text-white" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Done
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => onRecall?.(token.id)}
                    >
                      {busy === `recall-${token.id}` ? (
                        <Spinner />
                      ) : (
                        <BellRing className="h-3.5 w-3.5" />
                      )}
                      Recall
                    </Button>
                    <Button
                      size="sm"
                      variant="warning"
                      disabled={busy !== null}
                      onClick={() => onSkip?.(token.id)}
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy !== null}
                      onClick={() => onCancel?.(token.id)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Inbox}
            title="No active test drives"
            description="Call the next waiting customer when a vehicle slot is free."
          />
        )}

        {interactive && onCallNext ? (
          <Button
            size="xl"
            className="w-full"
            disabled={busy !== null || slotsFull}
            onClick={onCallNext}
          >
            {busy === "next" ? (
              <>
                <Spinner className="text-white" /> Calling next token...
              </>
            ) : (
              <>
                <ChevronRight className="h-5 w-5" />
                {slotsFull
                  ? `All ${maxConcurrent} slots full`
                  : "Next Token"}
              </>
            )}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function WaitingQueuePanel({
  waitingTokens,
  busy,
  interactive = false,
  showNavigateLink = false,
  onCall,
  onSkip,
  onCancel,
}: {
  waitingTokens: TokenWithRelations[];
  busy?: BusyKey;
  interactive?: boolean;
  showNavigateLink?: boolean;
  onCall?: (tokenId: string) => void;
  onSkip?: (tokenId: string) => void;
  onCancel?: (tokenId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Waiting Queue ({waitingTokens.length})</CardTitle>
        {showNavigateLink ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/queue">Open Queue Control</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {waitingTokens.length ? (
          waitingTokens.map((token, index) => (
            <div
              key={token.id}
              className="flex flex-col gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  <span className="mr-2 text-xs font-medium text-[var(--muted)]">
                    #{index + 1}
                  </span>
                  {token.tokenNumber}
                </p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {token.customerCode} · {token.customer.name} ·{" "}
                  {vehicleDisplayName(
                    token.vehicle.brand,
                    token.vehicle.model
                  )}
                </p>
              </div>
              {interactive ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => onCall?.(token.id)}
                  >
                    {busy === `call-${token.id}` ? (
                      <Spinner className="text-white" />
                    ) : (
                      "Call"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="warning"
                    disabled={busy !== null}
                    onClick={() => onSkip?.(token.id)}
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy !== null}
                    onClick={() => onCancel?.(token.id)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState
            icon={Inbox}
            title="No waiting tokens"
            description="The waiting list is empty."
          />
        )}
      </CardContent>
    </Card>
  );
}

export function CompletedTodayPanel({
  completedTokens,
  limit = 8,
}: {
  completedTokens: TokenWithRelations[];
  limit?: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Completed Today</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {completedTokens.length ? (
          completedTokens.slice(0, limit).map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2"
            >
              <span className="font-semibold">{token.tokenNumber}</span>
              <span className="truncate text-xs text-[var(--muted)]">
                {token.customer.name} ·{" "}
                {vehicleDisplayName(token.vehicle.brand, token.vehicle.model)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--muted)]">No completed tokens today.</p>
        )}
      </CardContent>
    </Card>
  );
}
