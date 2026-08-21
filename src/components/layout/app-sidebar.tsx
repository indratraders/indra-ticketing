"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Car,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  MonitorPlay,
  Settings,
  Ticket,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types";
import { ROLE_LABELS } from "@/lib/constants";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN"],
  },
  {
    href: "/tokens",
    label: "Issue Token",
    icon: Ticket,
    roles: ["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"],
  },
  {
    href: "/queue",
    label: "Queue Control",
    icon: MonitorPlay,
    roles: ["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"],
  },
  {
    href: "/history",
    label: "Token History",
    icon: History,
    roles: ["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"],
  },
  {
    href: "/vehicles",
    label: "Vehicles",
    icon: Car,
    roles: ["ADMIN"],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"],
  },
  {
    href: "/display",
    label: "Display",
    icon: Monitor,
    roles: ["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ["ADMIN"],
  },
];

function SidebarContent({
  user,
  onNavigate,
}: {
  user: { name: string; email: string; role: UserRole };
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    onNavigate?.();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
          Indra Traders
        </p>
        <h1 className="mt-1 text-lg font-semibold leading-tight">
          Test Drive Tokens
        </h1>
        <p className="mt-2 text-xs text-white/60">{ROLE_LABELS[user.role]}</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-[var(--brand-primary)] text-white shadow-sm"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 rounded-xl bg-white/5 px-3 py-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-white/50">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </>
  );
}

export function AppSidebar({
  user,
  mobileOpen,
  onMobileOpenChange,
}: {
  user: { name: string; email: string; role: UserRole };
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    onMobileOpenChange(false);
  }, [pathname, onMobileOpenChange]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] text-white lg:flex">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          aria-label="Close menu"
          onClick={() => onMobileOpenChange(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-[var(--sidebar)] text-white shadow-2xl transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <button
            type="button"
            className="absolute right-3 top-3 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Close navigation"
            onClick={() => onMobileOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent
            user={user}
            onNavigate={() => onMobileOpenChange(false)}
          />
        </aside>
      </div>
    </>
  );
}

export function MobileTopBar({
  onMenuClick,
  title = "Indra Traders",
}: {
  onMenuClick: () => void;
  title?: string;
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--foreground)] shadow-sm"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-gold)]">
          Indra Traders
        </p>
        <p className="truncate text-sm font-semibold">{title}</p>
      </div>
    </header>
  );
}
