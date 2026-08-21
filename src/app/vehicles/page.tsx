"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Car } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, PageLoader, Spinner } from "@/components/ui/feedback";
import { vehicleDisplayName } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@/types";

export default function VehiclesPage() {
  return (
    <DashboardShellClient allowedRoles={["ADMIN"]}>
      <VehiclesView />
    </DashboardShellClient>
  );
}

function VehiclesView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    registrationNumber: "",
    status: "AVAILABLE" as VehicleStatus,
    active: true,
  });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/vehicles");
    const json = await res.json();
    if (json.success) setVehicles(json.data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      brand: "",
      model: "",
      registrationNumber: "",
      status: "AVAILABLE",
      active: true,
    });
    setOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    setForm({
      brand: vehicle.brand,
      model: vehicle.model,
      registrationNumber: vehicle.registrationNumber ?? "",
      status: vehicle.status,
      active: vehicle.active,
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(editing ? "Vehicle updated" : "Vehicle added");
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader label="Loading vehicles..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Vehicles</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Manage vehicles available for test drives
          </p>
        </div>
        <Button onClick={openCreate}>Add Vehicle</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet</CardTitle>
        </CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <EmptyState
              icon={Car}
              title="No vehicles available for test drives"
              description="Add BYD, Foton or other models to start issuing tokens."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="pb-3">Vehicle</th>
                    <th className="pb-3">Registration</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Active</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id} className="border-b border-[var(--border)]/70">
                      <td className="py-3 font-medium">
                        {vehicleDisplayName(v.brand, v.model)}
                      </td>
                      <td className="py-3">{v.registrationNumber ?? "—"}</td>
                      <td className="py-3">{v.status.replaceAll("_", " ")}</td>
                      <td className="py-3">{v.active ? "Yes" : "No"}</td>
                      <td className="py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(v)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Vehicle" : "Add Vehicle"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Brand</Label>
              <Input
                value={form.brand}
                onChange={(e) =>
                  setForm((f) => ({ ...f, brand: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={form.model}
                onChange={(e) =>
                  setForm((f) => ({ ...f, model: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Registration</Label>
              <Input
                value={form.registrationNumber}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    registrationNumber: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as VehicleStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "AVAILABLE",
                      "IN_TEST_DRIVE",
                      "MAINTENANCE",
                      "UNAVAILABLE",
                    ] as VehicleStatus[]
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2">
              <Label>Active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Spinner className="text-white" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
