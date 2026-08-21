import { createEntityId, getStore } from "@/lib/db/demo-store";
import { nowISO } from "@/lib/utils/date";
import type { Vehicle, VehicleStatus } from "@/types";

/**
 * DEMO: in-memory vehicle repository.
 * Replace with Prisma Vehicle model when MySQL is connected.
 */
export const vehicleRepository = {
  list(activeOnly = false): Vehicle[] {
    const vehicles = getStore().vehicles;
    return activeOnly ? vehicles.filter((v) => v.active) : [...vehicles];
  },

  findById(id: string): Vehicle | null {
    return getStore().vehicles.find((v) => v.id === id) ?? null;
  },

  listAvailable(): Vehicle[] {
    return getStore().vehicles.filter(
      (v) =>
        v.active &&
        v.status !== "MAINTENANCE" &&
        v.status !== "UNAVAILABLE" &&
        // Keep fleet picker clean — custom/unspecified live under brand Other
        v.brand.toLowerCase() !== "other"
    );
  },

  async findOrCreateCustom(name: string): Promise<Vehicle> {
    const model = name.trim().replace(/\s+/g, " ");
    const existing = getStore().vehicles.find(
      (v) =>
        v.active &&
        v.brand.toLowerCase() === "other" &&
        v.model.toLowerCase() === model.toLowerCase()
    );
    if (existing) return existing;
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
    const existing = this.findById(id);
    if (existing) {
      if (!existing.active) {
        return this.update(id, { active: true, status: "AVAILABLE" })!;
      }
      return existing;
    }
    const now = nowISO();
    const vehicle: Vehicle = {
      id,
      brand: "Other",
      model: "Not specified",
      registrationNumber: null,
      status: "AVAILABLE",
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    getStore().vehicles.push(vehicle);
    return vehicle;
  },

  create(input: {
    brand: string;
    model: string;
    registrationNumber?: string | null;
    status: VehicleStatus;
    active: boolean;
  }): Vehicle {
    const now = nowISO();
    const vehicle: Vehicle = {
      id: createEntityId("veh"),
      brand: input.brand,
      model: input.model,
      registrationNumber: input.registrationNumber || null,
      status: input.status,
      active: input.active,
      createdAt: now,
      updatedAt: now,
    };
    getStore().vehicles.push(vehicle);
    return vehicle;
  },

  update(
    id: string,
    input: Partial<
      Pick<
        Vehicle,
        "brand" | "model" | "registrationNumber" | "status" | "active"
      >
    >
  ): Vehicle | null {
    const store = getStore();
    const idx = store.vehicles.findIndex((v) => v.id === id);
    if (idx < 0) return null;
    store.vehicles[idx] = {
      ...store.vehicles[idx],
      ...input,
      updatedAt: nowISO(),
    };
    return store.vehicles[idx];
  },
};
