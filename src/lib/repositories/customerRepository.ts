import { createEntityId, getStore } from "@/lib/db/demo-store";
import { nowISO } from "@/lib/utils/date";
import type { Customer } from "@/types";

/**
 * DEMO: in-memory customer repository.
 * Replace with Prisma Customer model when MySQL is connected.
 */
export const customerRepository = {
  findById(id: string): Customer | null {
    return getStore().customers.find((c) => c.id === id) ?? null;
  },

  findByContact(contactNumber: string): Customer | null {
    const normalized = contactNumber.replace(/\s+/g, "");
    return (
      getStore().customers.find(
        (c) => c.contactNumber.replace(/\s+/g, "") === normalized
      ) ?? null
    );
  },

  create(input: {
    name: string;
    contactNumber: string;
    nic?: string | null;
    email?: string | null;
  }): Customer {
    const now = nowISO();
    const customer: Customer = {
      id: createEntityId("cust"),
      name: input.name,
      contactNumber: input.contactNumber,
      nic: input.nic || null,
      email: input.email || null,
      createdAt: now,
      updatedAt: now,
    };
    getStore().customers.push(customer);
    return customer;
  },

  findOrCreate(input: {
    name: string;
    contactNumber: string;
    nic?: string | null;
    email?: string | null;
  }): Customer {
    const existing = this.findByContact(input.contactNumber);
    if (existing) {
      existing.name = input.name;
      if (input.nic) existing.nic = input.nic;
      if (input.email) existing.email = input.email;
      existing.updatedAt = nowISO();
      return existing;
    }
    return this.create(input);
  },
};
