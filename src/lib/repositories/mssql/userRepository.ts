import { getSqlPool, sql } from "@/lib/db/sqlserver";
import type { SafeUser, User, UserRole } from "@/types";
import { mapUser, toSafeUser } from "./mappers";

export const userRepository = {
  async findByEmail(email: string): Promise<User | null> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("email", sql.NVarChar(191), email)
      .query(
        `SELECT TOP 1 * FROM dbo.users
         WHERE LOWER(email) = LOWER(@email) AND active = 1`
      );
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapUser(row) : null;
  },

  async findById(id: string): Promise<User | null> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("id", sql.NVarChar(64), id)
      .query(`SELECT TOP 1 * FROM dbo.users WHERE id = @id`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapUser(row) : null;
  },

  async findSafeById(id: string): Promise<SafeUser | null> {
    const user = await this.findById(id);
    return user ? toSafeUser(user) : null;
  },

  async list(): Promise<SafeUser[]> {
    const pool = await getSqlPool();
    const result = await pool.request().query(`SELECT * FROM dbo.users ORDER BY name`);
    return (result.recordset as Record<string, unknown>[]).map((row) =>
      toSafeUser(mapUser(row))
    );
  },

  async listByRole(role: UserRole): Promise<SafeUser[]> {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input("role", sql.NVarChar(32), role)
      .query(`SELECT * FROM dbo.users WHERE role = @role ORDER BY name`);
    return (result.recordset as Record<string, unknown>[]).map((row) =>
      toSafeUser(mapUser(row))
    );
  },
};
