import bcrypt from "bcryptjs";
import {
  AuthError,
  clearSessionCookie,
  createSessionToken,
  ROLE_HOME,
  setSessionCookie,
} from "@/lib/auth/session";
import { userRepository } from "@/lib/repositories";
import { loginSchema } from "@/lib/validation/schemas";
import type { SafeUser } from "@/types";

export const authService = {
  async login(email: string, password: string) {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      throw new AuthError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await userRepository.findByEmail(parsed.data.email);
    if (!user || !user.active) {
      throw new AuthError("Invalid email or password");
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      throw new AuthError("Invalid email or password");
    }

    const role = String(user.role ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_") as SafeUser["role"];

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
      active: user.active,
    };

    const token = await createSessionToken(safeUser);
    await setSessionCookie(token);

    return {
      user: safeUser,
      redirectTo: ROLE_HOME[safeUser.role],
    };
  },

  async logout() {
    await clearSessionCookie();
  },
};
