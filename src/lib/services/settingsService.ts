import { broadcastRealtime } from "@/lib/db/demo-store";
import { settingsRepository, vehicleRepository } from "@/lib/repositories";
import { nowISO } from "@/lib/utils/date";
import {
  settingsSchema,
  vehicleSchema,
  type SettingsFormInput,
  type VehicleFormInput,
} from "@/lib/validation/schemas";

export const settingsService = {
  async get() {
    return settingsRepository.get();
  },

  async update(input: SettingsFormInput) {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid settings");
    }
    const updated = await settingsRepository.update({
      ...parsed.data,
      tokenPrefix: (parsed.data.tokenPrefix || "").toUpperCase(),
      customerCodePrefix: parsed.data.customerCodePrefix.toUpperCase(),
    });
    broadcastRealtime({
      type: "SETTINGS_UPDATED",
      payload: updated,
      timestamp: nowISO(),
    });
    return updated;
  },

  async listCounters() {
    return settingsRepository.listCounters();
  },
};

export const vehicleService = {
  async list(activeOnly = false) {
    return vehicleRepository.list(activeOnly);
  },

  async listAvailable() {
    return vehicleRepository.listAvailable();
  },

  async create(input: VehicleFormInput) {
    const parsed = vehicleSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid vehicle");
    }
    return vehicleRepository.create({
      ...parsed.data,
      registrationNumber: parsed.data.registrationNumber || null,
    });
  },

  async update(id: string, input: VehicleFormInput) {
    const parsed = vehicleSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid vehicle");
    }
    const updated = await vehicleRepository.update(id, {
      ...parsed.data,
      registrationNumber: parsed.data.registrationNumber || null,
    });
    if (!updated) throw new Error("Vehicle not found");
    return updated;
  },
};
