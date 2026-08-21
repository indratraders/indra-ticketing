import { pgQuery, pgQueryOne } from "@/lib/db/postgres";
import type { SafeUser, User, UserRole } from "@/types";
import { mapUser, toSafeUser } from "../mssql/mappers";

export const userRepository = {
  async findByEmail(email: string): Promise<User | null> {
    const row = await pgQueryOne(
      `SELECT * FROM public.users
       WHERE LOWER(email) = LOWER($1) AND active = true
       LIMIT 1`,
      [email]
    );
    return row ? mapUser(row) : null;
  },

  async findById(id: string): Promise<User | null> {
    const row = await pgQueryOne(
      `SELECT * FROM public.users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return row ? mapUser(row) : null;
  },

  async findSafeById(id: string): Promise<SafeUser | null> {
    const user = await this.findById(id);
    return user ? toSafeUser(user) : null;
  },

  async list(): Promise<SafeUser[]> {
    const rows = await pgQuery(`SELECT * FROM public.users ORDER BY name`);
    return rows.map((row) => toSafeUser(mapUser(row)));
  },

  async listByRole(role: UserRole): Promise<SafeUser[]> {
    const rows = await pgQuery(
      `SELECT * FROM public.users WHERE role = $1 ORDER BY name`,
      [role]
    );
    return rows.map((row) => toSafeUser(mapUser(row)));
  },
};
