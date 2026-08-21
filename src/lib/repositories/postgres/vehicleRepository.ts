import { createEntityId } from "@/lib/db/demo-store";
import { pgQuery, pgQueryOne } from "@/lib/db/postgres";
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

async function ensureFleet(): Promise<void> {
  if (globalThis.__indraFleetEnsured) return;
  try {
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
    // Legacy Kia Sonet → Suzuki Wagon R
    await pgQuery(
      `UPDATE public.vehicles
       SET brand = 'Suzuki', model = 'Wagon R', active = false, status = 'AVAILABLE', "updatedAt" = now()
       WHERE id = 'veh_sonet'`
    );
    globalThis.__indraFleetEnsured = true;
  } catch {
    // Table may not exist yet — leave for setup SQL
  }
}

export const vehicleRepository = {
  async list(activeOnly = false): Promise<Vehicle[]> {
    await ensureFleet();
    const rows = activeOnly
      ? await pgQuery(
          `SELECT * FROM public.vehicles WHERE active = true ORDER BY brand, model`
        )
      : await pgQuery(`SELECT * FROM public.vehicles ORDER BY brand, model`);
    return rows.map(mapVehicle);
  },

  async findById(id: string): Promise<Vehicle | null> {
    await ensureFleet();
    const row = await pgQueryOne(
      `SELECT * FROM public.vehicles WHERE id = $1 LIMIT 1`,
      [id]
    );
    return row ? mapVehicle(row) : null;
  },

  async listAvailable(): Promise<Vehicle[]> {
    await ensureFleet();
    const rows = await pgQuery(
      `SELECT * FROM public.vehicles
       WHERE active = true
         AND status <> 'MAINTENANCE'
         AND status <> 'UNAVAILABLE'
         AND LOWER(brand) <> 'other'
       ORDER BY brand, model`
    );
    return rows.map(mapVehicle);
  },

  async findOrCreateCustom(name: string): Promise<Vehicle> {
    const model = name.trim().replace(/\s+/g, " ");
    const existing = await pgQueryOne(
      `SELECT * FROM public.vehicles
       WHERE active = true
         AND LOWER(brand) = 'other'
         AND LOWER(model) = LOWER($1)
       LIMIT 1`,
      [model]
    );
    if (existing) return mapVehicle(existing);
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
    await pgQuery(
      `INSERT INTO public.vehicles
        (id, brand, model, "registrationNumber", status, active, "createdAt", "updatedAt")
       VALUES ($1, 'Other', 'Not specified', NULL, 'AVAILABLE', true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [id]
    );
    return {
      id,
      brand: "Other",
      model: "Not specified",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  },

  async create(input: {
    brand: string;
    model: string;
    registrationNumber?: string | null;
    status: VehicleStatus;
    active: boolean;
  }): Promise<Vehicle> {
    const id = createEntityId("veh");
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
    return {
      id,
      brand: input.brand,
      model: input.model,
      registrationNumber: input.registrationNumber || null,
      status: input.status,
      active: input.active,
      createdAt: nowISO(),
      updatedAt: nowISO(),
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
    return next;
  },
};
