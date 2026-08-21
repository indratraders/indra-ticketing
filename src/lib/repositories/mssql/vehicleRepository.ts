import { createEntityId } from "@/lib/db/demo-store";
import { getSqlPool, sql } from "@/lib/db/sqlserver";
import { nowISO } from "@/lib/utils/date";
import type { Vehicle, VehicleStatus } from "@/types";
import { mapVehicle } from "./mappers";

export const vehicleRepository = {
  async list(activeOnly = false): Promise<Vehicle[]> {
    const pool = await getSqlPool();
    const result = activeOnly
      ? await pool
          .request()
          .query(`SELECT * FROM dbo.vehicles WHERE active = 1 ORDER BY brand, model`)
      : await pool
          .request()
          .query(`SELECT * FROM dbo.vehicles ORDER BY brand, model`);
    return (result.recordset as Record<string, unknown>[]).map(mapVehicle);
  },

  async findById(id: string): Promise<Vehicle | null> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .query(`SELECT TOP 1 * FROM dbo.vehicles WHERE id = @id`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapVehicle(row) : null;
  },

  async listAvailable(): Promise<Vehicle[]> {
    // Active fleet for issuing — hide ad-hoc "Other" custom entries from picker
    const pool = await getSqlPool();
    const result = await pool.request().query(
      `SELECT * FROM dbo.vehicles
       WHERE active = 1
         AND status <> N'MAINTENANCE'
         AND status <> N'UNAVAILABLE'
         AND LOWER(brand) <> N'other'
       ORDER BY brand, model`
    );
    return (result.recordset as Record<string, unknown>[]).map(mapVehicle);
  },

  async findOrCreateCustom(name: string): Promise<Vehicle> {
    const model = name.trim().replace(/\s+/g, " ");
    const pool = await getSqlPool();
    const existing = await pool
      .request()
      .input("model", sql.NVarChar(100), model)
      .query(
        `SELECT TOP 1 * FROM dbo.vehicles
         WHERE active = 1
           AND LOWER(brand) = N'other'
           AND LOWER(model) = LOWER(@model)`
      );
    const row = existing.recordset[0] as Record<string, unknown> | undefined;
    if (row) return mapVehicle(row);
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
    const pool = await getSqlPool();
    const now = new Date();
    await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .input("brand", sql.NVarChar(100), "Other")
      .input("model", sql.NVarChar(100), "Not specified")
      .input("status", sql.NVarChar(32), "AVAILABLE")
      .input("active", sql.Bit, true)
      .input("now", sql.DateTime2, now)
      .query(
        `INSERT INTO dbo.vehicles
          (id, brand, model, registrationNumber, status, active, createdAt, updatedAt)
         VALUES
          (@id, @brand, @model, NULL, @status, @active, @now, @now)`
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
    const pool = await getSqlPool();
    const now = new Date();
    const id = createEntityId("veh");
    await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .input("brand", sql.NVarChar(100), input.brand)
      .input("model", sql.NVarChar(100), input.model)
      .input(
        "registrationNumber",
        sql.NVarChar(50),
        input.registrationNumber || null
      )
      .input("status", sql.NVarChar(32), input.status)
      .input("active", sql.Bit, input.active)
      .input("now", sql.DateTime2, now)
      .query(
        `INSERT INTO dbo.vehicles
          (id, brand, model, registrationNumber, status, active, createdAt, updatedAt)
         VALUES
          (@id, @brand, @model, @registrationNumber, @status, @active, @now, @now)`
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

    const pool = await getSqlPool();
    await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .input("brand", sql.NVarChar(100), next.brand)
      .input("model", sql.NVarChar(100), next.model)
      .input(
        "registrationNumber",
        sql.NVarChar(50),
        next.registrationNumber
      )
      .input("status", sql.NVarChar(32), next.status)
      .input("active", sql.Bit, next.active)
      .input("updatedAt", sql.DateTime2, new Date())
      .query(
        `UPDATE dbo.vehicles SET
           brand = @brand,
           model = @model,
           registrationNumber = @registrationNumber,
           status = @status,
           active = @active,
           updatedAt = @updatedAt
         WHERE id = @id`
      );

    return next;
  },
};
