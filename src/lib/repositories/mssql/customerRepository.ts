import { createEntityId } from "@/lib/db/demo-store";
import { getSqlPool, sql } from "@/lib/db/sqlserver";
import { nowISO } from "@/lib/utils/date";
import type { Customer } from "@/types";
import { mapCustomer } from "./mappers";

function normalizeContact(contactNumber: string): string {
  return contactNumber.replace(/\s+/g, "");
}

export const customerRepository = {
  async findById(id: string): Promise<Customer | null> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .query(`SELECT TOP 1 * FROM dbo.customers WHERE id = @id`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapCustomer(row) : null;
  },

  async findByContact(contactNumber: string): Promise<Customer | null> {
    const pool = await getSqlPool();
    const normalized = normalizeContact(contactNumber);
    const result = await pool
      .request()
      .input("contact", sql.NVarChar(40), normalized)
      .query(
        `SELECT TOP 1 * FROM dbo.customers
         WHERE REPLACE(contactNumber, N' ', N'') = @contact`
      );
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapCustomer(row) : null;
  },

  async create(input: {
    name: string;
    contactNumber: string;
    nic?: string | null;
    email?: string | null;
  }): Promise<Customer> {
    const pool = await getSqlPool();
    const now = new Date();
    const id = createEntityId("cust");
    await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .input("name", sql.NVarChar(191), input.name)
      .input("contactNumber", sql.NVarChar(40), input.contactNumber)
      .input("nic", sql.NVarChar(40), input.nic || null)
      .input("email", sql.NVarChar(191), input.email || null)
      .input("now", sql.DateTime2, now)
      .query(
        `INSERT INTO dbo.customers
          (id, name, contactNumber, nic, email, createdAt, updatedAt)
         VALUES
          (@id, @name, @contactNumber, @nic, @email, @now, @now)`
      );

    return {
      id,
      name: input.name,
      contactNumber: input.contactNumber,
      nic: input.nic || null,
      email: input.email || null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  },

  async findOrCreate(input: {
    name: string;
    contactNumber: string;
    nic?: string | null;
    email?: string | null;
  }): Promise<Customer> {
    const existing = await this.findByContact(input.contactNumber);
    if (existing) {
      const pool = await getSqlPool();
      const now = new Date();
      const nic = input.nic || existing.nic;
      const email = input.email || existing.email;
      await pool
        .request()
        .input("id", sql.NVarChar(64), existing.id)
        .input("name", sql.NVarChar(191), input.name)
        .input("nic", sql.NVarChar(40), nic)
        .input("email", sql.NVarChar(191), email)
        .input("updatedAt", sql.DateTime2, now)
        .query(
          `UPDATE dbo.customers SET
             name = @name,
             nic = @nic,
             email = @email,
             updatedAt = @updatedAt
           WHERE id = @id`
        );
      return {
        ...existing,
        name: input.name,
        nic,
        email,
        updatedAt: nowISO(),
      };
    }
    return this.create(input);
  },
};
