import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth/session";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";
import type { UserRole } from "@/types";

/** Server wrapper — prefers client shell for responsive nav. */
export async function DashboardShell({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "ADMIN" && !allowedRoles.includes(session.role)) {
    redirect(ROLE_HOME[session.role]);
  }

  return (
    <DashboardShellClient allowedRoles={allowedRoles}>
      {children}
    </DashboardShellClient>
  );
}
