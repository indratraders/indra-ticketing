import { createEntityId } from "@/lib/db/demo-store";
import { pgQuery, pgQueryOne } from "@/lib/db/postgres";
import {
  isSupabaseRestEnabled,
  supabaseRest,
} from "@/lib/db/supabase-rest";
import { nowISO } from "@/lib/utils/date";
import type { Vehicle, VehicleStatus } from "@/types";
import { mapVehicle } from "../mssql/mappers";

declare global {
  // eslint-disable-next-line no-var
  var __indraFleetEnsured: boolean | undefined;
}

const FLEET: Array<[string, string, string]> = [
  ["veh_raptor", "Ford", "Raptor"],
  ["veh_vezel", "Honda", "Vezel"],
  ["veh_taisor", "Toyota", "Taisor"],
  ["veh_wagonr", "Suzuki", "Wagon R"],
  ["veh_raize", "Toyota", "Raize"],
  ["veh_dayz", "Nissan", "Dayz"],
];

function isFleetVehicle(v: Vehicle): boolean {
  return (
    v.active &&
    v.status !== "MAINTENANCE" &&
    v.status !== "UNAVAILABLE" &&
    v.brand.toLowerCase() !== "other"
  );
}

async function ensureFleetRest(): Promise<void> {
  if (globalThis.__indraFleetEnsured) return;
  const rows = FLEET.map(([id, brand, model]) => ({
    id,
    brand,
    model,
    registrationNumber: null,
    status: "AVAILABLE",
    active: true,
  }));
  await supabaseRest("vehicles", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(rows),
  });
  await supabaseRest("vehicles?id=eq.veh_sonet", {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      brand: "Suzuki",
      model: "Wagon R",
      active: false,
      status: "AVAILABLE",
    }),
  }).catch(() => undefined);
  globalThis.__indraFleetEnsured = true;
}

async function ensureFleetPg(): Promise<void> {
  if (globalThis.__indraFleetEnsured) return;
  for (const [id, brand, model] of FLEET) {
    await pgQuery(
      `INSERT INTO public.vehicles
        (id, brand, model, "registrationNumber", status, active, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NULL, 'AVAILABLE', true, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         brand = EXCLUDED.brand,
         model = EXCLUDED.model,
         status = 'AVAILABLE',
         active = true,
         "updatedAt" = now()`,
      [id, brand, model]
    );
  }
  await pgQuery(
    `UPDATE public.vehicles
     SET brand = 'Suzuki', model = 'Wagon R', active = false, status = 'AVAILABLE', "updatedAt" = now()
     WHERE id = 'veh_sonet'`
  );
  globalThis.__indraFleetEnsured = true;
}

async function listAvailableRest(): Promise<Vehicle[]> {
  await ensureFleetRest();
  const rows = await supabaseRest<Record<string, unknown>[]>(
    "vehicles?active=eq.true&status=neq.MAINTENANCE&status=neq.UNAVAILABLE&order=brand.asc,model.asc&select=*"
  );
  return (rows || [])
    .map(mapVehicle)
    .filter((v) => v.brand.toLowerCase() !== "other");
}

async function listRest(activeOnly: boolean): Promise<Vehicle[]> {
  await ensureFleetRest();
  const filter = activeOnly ? "&active=eq.true" : "";
  const rows = await supabaseRest<Record<string, unknown>[]>(
    `vehicles?order=brand.asc,model.asc&select=*${filter}`
  );
  return (rows || []).map(mapVehicle);
}

export const vehicleRepository = {
  async list(activeOnly = false): Promise<Vehicle[]> {
    if (isSupabaseRestEnabled()) {
      try {
        return await listRest(activeOnly);
      } catch {
        // fall through to pg
      }
    }
    await ensureFleetPg().catch(() => undefined);
    const rows = activeOnly
      ? await pgQuery(
          `SELECT * FROM public.vehicles WHERE active = true ORDER BY brand, model`
        )
      : await pgQuery(`SELECT * FROM public.vehicles ORDER BY brand, model`);
    return rows.map(mapVehicle);
  },

  async findById(id: string): Promise<Vehicle | null> {
    if (isSupabaseRestEnabled()) {
      try {
        const rows = await supabaseRest<Record<string, unknown>[]>(
          `vehicles?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
        );
        return rows?.[0] ? mapVehicle(rows[0]) : null;
      } catch {
        // fall through
      }
    }
    const row = await pgQueryOne(
      `SELECT * FROM public.vehicles WHERE id = $1 LIMIT 1`,
      [id]
    );
    return row ? mapVehicle(row) : null;
  },

  async listAvailable(): Promise<Vehicle[]> {
    if (isSupabaseRestEnabled()) {
      try {
        const vehicles = await listAvailableRest();
        if (vehicles.length > 0) return vehicles;
      } catch {
        // fall through
      }
    }
    try {
      await ensureFleetPg();
      const rows = await pgQuery(
        `SELECT * FROM public.vehicles
         WHERE active = true
           AND status <> 'MAINTENANCE'
           AND status <> 'UNAVAILABLE'
           AND LOWER(brand) <> 'other'
         ORDER BY brand, model`
      );
      const mapped = rows.map(mapVehicle);
      if (mapped.length > 0) return mapped;
    } catch {
      // last resort hardcoded fleet for the issue form
    }
    const now = nowISO();
    return FLEET.map(([id, brand, model]) => ({
      id,
      brand,
      model,
      registrationNumber: null,
      status: "AVAILABLE" as VehicleStatus,
      active: true,
      createdAt: now,
      updatedAt: now,
    })).filter(isFleetVehicle);
  },

  async findOrCreateCustom(name: string): Promise<Vehicle> {
    const model = name.trim().replace(/\s+/g, " ");
    if (isSupabaseRestEnabled()) {
      try {
        const existing = await supabaseRest<Record<string, unknown>[]>(
          `vehicles?active=eq.true&brand=eq.Other&model=ilike.${encodeURIComponent(model)}&select=*&limit=1`
        );
        if (existing?.[0]) return mapVehicle(existing[0]);
      } catch {
        // create below
      }
    } else {
      const existing = await pgQueryOne(
        `SELECT * FROM public.vehicles
         WHERE active = true
           AND LOWER(brand) = 'other'
           AND LOWER(model) = LOWER($1)
         LIMIT 1`,
        [model]
      );
      if (existing) return mapVehicle(existing);
    }
    return this.create({
      brand: "Other",
      model,
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
    });
  },

  async findOrCreateUnspecified(): Promise<Vehicle> {
    const id = "veh_unspecified";
    const existing = await this.findById(id);
    if (existing) {
      if (!existing.active || existing.status === "MAINTENANCE") {
        return (
          (await this.update(id, { active: true, status: "AVAILABLE" })) ??
          existing
        );
      }
      return existing;
    }
    return this.create({
      brand: "Other",
      model: "Not specified",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
    }).then(async (created) => {
      // Prefer stable id
      if (isSupabaseRestEnabled()) {
        await supabaseRest("vehicles", {
          method: "POST",
          prefer: "resolution=merge-duplicates,return=minimal",
          body: JSON.stringify({
            id,
            brand: "Other",
            model: "Not specified",
            registrationNumber: null,
            status: "AVAILABLE",
            active: true,
          }),
        }).catch(() => undefined);
        return (await this.findById(id)) ?? created;
      }
      await pgQuery(
        `INSERT INTO public.vehicles
          (id, brand, model, "registrationNumber", status, active, "createdAt", "updatedAt")
         VALUES ($1, 'Other', 'Not specified', NULL, 'AVAILABLE', true, now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [id]
      );
      return (await this.findById(id)) ?? created;
    });
  },

  async create(input: {
    brand: string;
    model: string;
    registrationNumber?: string | null;
    status: VehicleStatus;
    active: boolean;
  }): Promise<Vehicle> {
    const id = createEntityId("veh");
    const now = nowISO();
    if (isSupabaseRestEnabled()) {
      await supabaseRest("vehicles", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify({
          id,
          brand: input.brand,
          model: input.model,
          registrationNumber: input.registrationNumber || null,
          status: input.status,
          active: input.active,
        }),
      });
    } else {
      await pgQuery(
        `INSERT INTO public.vehicles
          (id, brand, model, "registrationNumber", status, active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
        [
          id,
          input.brand,
          input.model,
          input.registrationNumber || null,
          input.status,
          input.active,
        ]
      );
    }
    return {
      id,
      brand: input.brand,
      model: input.model,
      registrationNumber: input.registrationNumber || null,
      status: input.status,
      active: input.active,
      createdAt: now,
      updatedAt: now,
    };
  },

  async update(
    id: string,
    input: Partial<
      Pick<
        Vehicle,
        "brand" | "model" | "registrationNumber" | "status" | "active"
      >
    >
  ): Promise<Vehicle | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next: Vehicle = {
      ...existing,
      ...input,
      updatedAt: nowISO(),
    };
    if (isSupabaseRestEnabled()) {
      await supabaseRest(`vehicles?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          brand: next.brand,
          model: next.model,
          registrationNumber: next.registrationNumber,
          status: next.status,
          active: next.active,
        }),
      });
    } else {
      await pgQuery(
        `UPDATE public.vehicles SET
           brand = $2,
           model = $3,
           "registrationNumber" = $4,
           status = $5,
           active = $6,
           "updatedAt" = now()
         WHERE id = $1`,
        [
          id,
          next.brand,
          next.model,
          next.registrationNumber,
          next.status,
          next.active,
        ]
      );
    }
    return next;
  },
};
