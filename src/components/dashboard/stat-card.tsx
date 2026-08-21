import { cn } from "@/lib/utils/cn";

export function StatCard({
  label,
  value,
  hint,
  accent = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "amber" | "blue" | "green" | "rose" | "orange";
}) {
  const accents = {
    default: "from-slate-50 to-white",
    amber: "from-amber-50 to-white",
    blue: "from-blue-50 to-white",
    green: "from-emerald-50 to-white",
    rose: "from-rose-50 to-white",
    orange: "from-orange-50 to-white",
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-gradient-to-b p-4 shadow-[var(--shadow-card)] sm:p-5",
        accents[accent]
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-xs sm:tracking-[0.14em]">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:mt-2 sm:text-3xl">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
