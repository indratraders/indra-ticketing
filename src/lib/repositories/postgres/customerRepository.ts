import { createEntityId } from "@/lib/db/demo-store";
import { pgQuery, pgQueryOne } from "@/lib/db/postgres";
import { nowISO } from "@/lib/utils/date";
import type { Customer } from "@/types";
import { mapCustomer } from "../mssql/mappers";

function normalizeContact(contactNumber: string): string {
  return contactNumber.replace(/\s+/g, "");
}

export const customerRepository = {
  async findById(id: string): Promise<Customer | null> {
    const row = await pgQueryOne(
      `SELECT * FROM public.customers WHERE id = $1 LIMIT 1`,
      [id]
    );
    return row ? mapCustomer(row) : null;
  },

  async findByContact(contactNumber: string): Promise<Customer | null> {
    const normalized = normalizeContact(contactNumber);
    const row = await pgQueryOne(
      `SELECT * FROM public.customers
       WHERE REPLACE("contactNumber", ' ', '') = $1
       LIMIT 1`,
      [normalized]
    );
    return row ? mapCustomer(row) : null;
  },

  async create(input: {
    name: string;
    contactNumber: string;
    nic?: string | null;
    email?: string | null;
  }): Promise<Customer> {
    const id = createEntityId("cust");
    await pgQuery(
      `INSERT INTO public.customers
        (id, name, "contactNumber", nic, email, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, now(), now())`,
      [
        id,
        input.name,
        input.contactNumber,
        input.nic || null,
        input.email || null,
      ]
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
      const nic = input.nic || existing.nic;
      const email = input.email || existing.email;
      await pgQuery(
        `UPDATE public.customers SET
           name = $2,
           nic = $3,
           email = $4,
           "updatedAt" = now()
         WHERE id = $1`,
        [existing.id, input.name, nic, email]
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
