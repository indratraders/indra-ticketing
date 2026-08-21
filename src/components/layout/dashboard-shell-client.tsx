"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar, MobileTopBar } from "@/components/layout/app-sidebar";
import { PageLoader } from "@/components/ui/feedback";
import type { UserRole } from "@/types";
import { ROLE_HOME } from "@/lib/auth/session-client";

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/tokens": "Issue Token",
  "/queue": "Queue Control",
  "/history": "Token History",
  "/vehicles": "Vehicles",
  "/reports": "Reports",
  "/settings": "Settings",
  "/display": "Display",
};

export function DashboardShellClient({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{
    name: string;
    email: string;
    role: UserRole;
  } | null>(null);
  const [checking, setChecking] = useState(true);

  // Stable key so inline `allowedRoles={[...]}` arrays don't retrigger forever
  const rolesKey = useMemo(
    () => [...allowedRoles].sort().join(","),
    [allowedRoles]
  );

  const onMobileOpenChange = useCallback((open: boolean) => {
    setMobileOpen(open);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setUser(null);
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const session = json.data?.user;
        if (!session) {
          router.replace("/login");
          return;
        }
        const role = String(session.role ?? "")
          .trim()
          .toUpperCase() as UserRole;
        const allowed = rolesKey.split(",") as UserRole[];
        if (role !== "ADMIN" && !allowed.includes(role)) {
          router.replace(ROLE_HOME[role] ?? "/login");
          return;
        }
        setUser({
          name: session.name,
          email: session.email,
          role,
        });
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rolesKey, router]);

  if (checking || !user) {
    return <PageLoader label="Checking session..." />;
  }

  const title =
    PAGE_TITLES[pathname] ??
    Object.entries(PAGE_TITLES).find(([key]) =>
      pathname.startsWith(key)
    )?.[1] ??
    "Test Drive Tokens";

  return (
    <div className="flex min-h-screen bg-[var(--background)] app-shell-bg">
      <AppSidebar
        user={user}
        mobileOpen={mobileOpen}
        onMobileOpenChange={onMobileOpenChange}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          title={title}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
