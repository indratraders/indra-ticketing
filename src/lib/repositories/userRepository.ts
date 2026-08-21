import { getStore } from "@/lib/db/demo-store";
import type { SafeUser, User, UserRole } from "@/types";

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

/**
 * DEMO: in-memory user repository.
 * Replace with Prisma User model when MySQL is connected.
 */
export const userRepository = {
  findByEmail(email: string): User | null {
    const store = getStore();
    return (
      store.users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase() && u.active
      ) ?? null
    );
  },

  findById(id: string): User | null {
    const store = getStore();
    return store.users.find((u) => u.id === id) ?? null;
  },

  findSafeById(id: string): SafeUser | null {
    const user = this.findById(id);
    return user ? toSafeUser(user) : null;
  },

  list(): SafeUser[] {
    return getStore().users.map(toSafeUser);
  },

  listByRole(role: UserRole): SafeUser[] {
    return getStore()
      .users.filter((u) => u.role === role)
      .map(toSafeUser);
  },
};
