"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Inbox, Plus, Printer, Ticket } from "lucide-react";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageLoader, Spinner } from "@/components/ui/feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { issueTokenApi, useQueueState } from "@/hooks/useQueueState";
import { FLOOR_ROLES, TEST_DRIVE_TYPE_LABELS, TEST_DRIVE_TYPE_OPTIONS, DEFAULT_TEST_DRIVE_TYPE } from "@/lib/constants";
import {
  ActiveDrivesPanel,
  WaitingQueuePanel,
} from "@/components/queue/queue-panels";
import { formatSriLankaDateTime, formatSriLankaTime } from "@/lib/utils/date";
import { vehicleDisplayName } from "@/lib/utils";
import type { TestDriveType, TokenWithRelations, Vehicle } from "@/types";
import { PrintableToken } from "@/components/token/printable-token";

export default function TokensPage() {
  return (
    <DashboardShellClient allowedRoles={FLOOR_ROLES}>
      <TokensDashboard />
    </DashboardShellClient>
  );
}

function TokensDashboard() {
  const { snapshot, stats, loading, refresh } = useQueueState({
    enableStats: true,
  });
  const [open, setOpen] = useState(false);
  const [issuedToken, setIssuedToken] = useState<TokenWithRelations | null>(
    null
  );

  if (loading && !snapshot) {
    return <PageLoader label="Loading queue..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
            Indra Traders
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Test Drive Token System
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Issue tokens and monitor today&apos;s showroom queue
          </p>
        </div>
        <Button
          size="xl"
          className="w-full sm:w-auto"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-5 w-5" />
          Issue New Token
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Issued" value={stats?.issued ?? 0} accent="default" />
        <StatCard
          label="Waiting"
          value={stats?.waiting ?? 0}
          accent="amber"
        />
        <StatCard
          label="In Progress"
          value={`${stats?.inProgress ?? 0}/${snapshot?.maxConcurrentActive ?? 6}`}
          accent="blue"
        />
        <StatCard
          label="Completed"
          value={stats?.completed ?? 0}
          accent="green"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <ActiveDrivesPanel
            activeTokens={snapshot?.activeTokens ?? []}
            activeCount={snapshot?.activeCount ?? 0}
            maxConcurrent={snapshot?.maxConcurrentActive ?? 6}
            interactive={false}
          />
        </div>
        <div className="xl:col-span-2">
          <WaitingQueuePanel
            waitingTokens={snapshot?.waitingTokens ?? []}
            showNavigateLink
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="pb-3 font-semibold">Token</th>
                  <th className="pb-3 font-semibold">Code</th>
                  <th className="pb-3 font-semibold">Customer</th>
                  <th className="pb-3 font-semibold">Vehicle</th>
                  <th className="pb-3 font-semibold">Issued</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...(snapshot?.activeTokens ?? []),
                  ...(snapshot?.waitingTokens ?? []),
                  ...(snapshot?.completedTokens.slice(0, 8) ?? []),
                ]
                  .filter(
                    (t, i, arr) => arr.findIndex((x) => x.id === t.id) === i
                  )
                  .map((token) => (
                    <tr
                      key={token.id}
                      className="border-b border-[var(--border)]/70"
                    >
                      <td className="py-3 font-semibold">{token.tokenNumber}</td>
                      <td className="py-3 text-[var(--muted)]">
                        {token.customerCode}
                      </td>
                      <td className="py-3">{token.customer.name}</td>
                      <td className="py-3">
                        {vehicleDisplayName(
                          token.vehicle.brand,
                          token.vehicle.model
                        )}
                      </td>
                      <td className="py-3 text-[var(--muted)]">
                        {formatSriLankaTime(token.issuedAt)}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={token.status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!snapshot?.waitingTokens.length &&
            !(snapshot?.activeTokens?.length) &&
            !snapshot?.completedTokens.length ? (
              <div className="py-8">
                <EmptyState
                  icon={Ticket}
                  title="No tokens issued today"
                  description="Click Issue New Token to create the first token of the day."
                />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <IssueTokenDialog
        open={open}
        onOpenChange={setOpen}
        onIssued={(token) => {
          setIssuedToken(token);
          void refresh();
        }}
      />

      <Dialog
        open={Boolean(issuedToken)}
        onOpenChange={(v) => !v && setIssuedToken(null)}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Token Issued</DialogTitle>
            <DialogDescription>
              Print the ticket or issue another token.
            </DialogDescription>
          </DialogHeader>
          {issuedToken ? <PrintableToken token={issuedToken} /> : null}
          <DialogFooter className="no-print gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setIssuedToken(null);
                setOpen(true);
              }}
            >
              New Token
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Print Token
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setIssuedToken(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IssueTokenDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (token: TokenWithRelations) => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    contactNumber: "",
    vehicleId: "",
    customVehicleName: "",
    testDriveType: DEFAULT_TEST_DRIVE_TYPE,
    nic: "",
    email: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    void fetch("/api/vehicles?available=true")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setVehicles(json.data);
      });
  }, [open]);

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id,
        label: vehicleDisplayName(v.brand, v.model),
      })),
    [vehicles]
  );

  const isOtherVehicle = form.vehicleId === "__other__";

  async function submit() {
    if (isOtherVehicle && form.customVehicleName.trim().length < 2) {
      toast.error("Type the vehicle name");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        vehicleId: isOtherVehicle ? "__other__" : form.vehicleId,
        customVehicleName: isOtherVehicle
          ? form.customVehicleName.trim()
          : "",
      };
      const token = (await issueTokenApi(payload)) as TokenWithRelations;
      toast.success(`Token ${token.tokenNumber} issued`);
      setForm({
        customerName: "",
        contactNumber: "",
        vehicleId: "",
        customVehicleName: "",
        testDriveType: DEFAULT_TEST_DRIVE_TYPE,
        nic: "",
        email: "",
        notes: "",
      });
      onOpenChange(false);
      onIssued(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue token");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Issue New Token</DialogTitle>
          <DialogDescription>
            Enter customer details quickly. Required fields only take a few
            seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input
              id="customerName"
              value={form.customerName}
              onChange={(e) =>
                setForm((f) => ({ ...f, customerName: e.target.value }))
              }
              placeholder="Kasun Perera"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactNumber">Contact Number *</Label>
            <Input
              id="contactNumber"
              value={form.contactNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, contactNumber: e.target.value }))
              }
              placeholder="0771234567"
            />
          </div>
          <div className="space-y-2">
            <Label>Test Drive Type *</Label>
            <Select
              value={form.testDriveType}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  testDriveType: v as TestDriveType,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEST_DRIVE_TYPE_OPTIONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {TEST_DRIVE_TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Vehicle / Model (optional)</Label>
            <Select
              value={form.vehicleId || "__none__"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  vehicleId: v === "__none__" ? "" : v,
                  customVehicleName:
                    v === "__other__" ? f.customVehicleName : "",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not specified yet</SelectItem>
                {vehicleOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
                <SelectItem value="__other__">Other — type vehicle name</SelectItem>
              </SelectContent>
            </Select>
            {isOtherVehicle ? null : form.vehicleId ? (
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline-offset-2 hover:underline"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    vehicleId: "",
                    customVehicleName: "",
                  }))
                }
              >
                Clear vehicle selection
              </button>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Optional. Choose a fleet vehicle, or Other to type a custom name.
              </p>
            )}
          </div>
          {isOtherVehicle ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customVehicleName">Type vehicle name *</Label>
              <Input
                id="customVehicleName"
                value={form.customVehicleName}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    customVehicleName: e.target.value,
                  }))
                }
                placeholder="e.g. Toyota Aqua, BYD Seal…"
                autoFocus
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="nic">NIC / ID (optional)</Label>
            <Input
              id="nic"
              value={form.nic}
              onChange={(e) => setForm((f) => ({ ...f, nic: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Spinner className="text-white" /> Generating token...
              </>
            ) : (
              "Generate Token"
            )}
          </Button>
        </DialogFooter>
        <p className="text-[11px] text-[var(--muted)]">
          Issued {formatSriLankaDateTime(new Date().toISOString())} (Asia/Colombo)
        </p>
      </DialogContent>
    </Dialog>
  );
}
