"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoader, Spinner } from "@/components/ui/feedback";
import type { Counter, SystemSettings } from "@/types";

export default function SettingsPage() {
  return (
    <DashboardShellClient allowedRoles={["ADMIN"]}>
      <SettingsView />
    </DashboardShellClient>
  );
}

function SettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [form, setForm] = useState({
    companyName: "",
    tokenPrefix: "",
    startingTokenNumber: 1,
    maxTokenNumber: 50,
    customerCodePrefix: "C",
    defaultCounterId: "",
    audioNotificationEnabled: true,
    textToSpeechEnabled: true,
    displayMode: "LARGE" as SystemSettings["displayMode"],
    autoCompleteOnNext: false,
    upcomingTokensCount: 3,
    displayShowCustomerName: true,
  });

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const data = json.data;
          setCounters(data.counters ?? []);
          setForm({
            companyName: data.companyName,
            tokenPrefix: data.tokenPrefix ?? "",
            startingTokenNumber: data.startingTokenNumber,
            maxTokenNumber: data.maxTokenNumber ?? 50,
            customerCodePrefix: data.customerCodePrefix ?? "C",
            defaultCounterId: data.defaultCounterId,
            audioNotificationEnabled: data.audioNotificationEnabled,
            textToSpeechEnabled: data.textToSpeechEnabled,
            displayMode: data.displayMode,
            autoCompleteOnNext: data.autoCompleteOnNext,
            upcomingTokensCount: data.upcomingTokensCount,
            displayShowCustomerName: data.displayShowCustomerName,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader label="Loading settings..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure token format, display and queue behaviour
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Company Name">
            <Input
              value={form.companyName}
              onChange={(e) =>
                setForm((f) => ({ ...f, companyName: e.target.value }))
              }
            />
          </Field>
          <Field label="Customer Code Prefix">
            <Input
              maxLength={3}
              value={form.customerCodePrefix}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  customerCodePrefix: e.target.value.toUpperCase(),
                }))
              }
            />
          </Field>
          <Field label="Starting Token Number">
            <Input
              type="number"
              min={1}
              value={form.startingTokenNumber}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  startingTokenNumber: Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="Max Token Number (then restarts)">
            <Input
              type="number"
              min={1}
              value={form.maxTokenNumber}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxTokenNumber: Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="Default Counter">
            <Select
              value={form.defaultCounterId}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, defaultCounterId: v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {counters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Display Mode">
            <Select
              value={form.displayMode}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  displayMode: v as SystemSettings["displayMode"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STANDARD">Standard</SelectItem>
                <SelectItem value="COMPACT">Compact</SelectItem>
                <SelectItem value="LARGE">Large</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Upcoming Tokens Shown">
            <Input
              type="number"
              min={1}
              max={10}
              value={form.upcomingTokensCount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  upcomingTokensCount: Number(e.target.value),
                }))
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Queue & Display Behaviour</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            label="Audio notification"
            checked={form.audioNotificationEnabled}
            onChange={(v) =>
              setForm((f) => ({ ...f, audioNotificationEnabled: v }))
            }
          />
          <Toggle
            label="Text-to-speech announcement"
            checked={form.textToSpeechEnabled}
            onChange={(v) =>
              setForm((f) => ({ ...f, textToSpeechEnabled: v }))
            }
          />
          <Toggle
            label="Show customer name on public display"
            checked={form.displayShowCustomerName}
            onChange={(v) =>
              setForm((f) => ({ ...f, displayShowCustomerName: v }))
            }
          />
          <Toggle
            label="Auto-complete current token when calling Next"
            checked={form.autoCompleteOnNext}
            onChange={(v) =>
              setForm((f) => ({ ...f, autoCompleteOnNext: v }))
            }
          />
          <p className="text-xs text-[var(--muted)]">
            Queue behaviour is FIFO. Multiple counters are supported via
            /display?counter=1
          </p>
        </CardContent>
      </Card>

      <Button size="lg" onClick={() => void save()} disabled={saving}>
        {saving ? (
          <>
            <Spinner className="text-white" /> Saving...
          </>
        ) : (
          "Save Settings"
        )}
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
