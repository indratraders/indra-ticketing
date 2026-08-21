import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { TokenStatus } from "@/types";
import { TOKEN_STATUS_LABELS } from "@/lib/constants";

const statusStyles: Record<TokenStatus, string> = {
  WAITING: "bg-amber-50 text-amber-800 border-amber-200",
  CALLED: "bg-sky-50 text-sky-800 border-sky-200",
  IN_PROGRESS: "bg-blue-50 text-blue-800 border-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  SKIPPED: "bg-orange-50 text-orange-800 border-orange-200",
  CANCELLED: "bg-rose-50 text-rose-800 border-rose-200",
  NO_SHOW: "bg-slate-100 text-slate-700 border-slate-200",
};

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        className
      )}
      {...props}
    />
  );
}

export function StatusBadge({ status }: { status: TokenStatus }) {
  return (
    <Badge className={statusStyles[status]}>{TOKEN_STATUS_LABELS[status]}</Badge>
  );
}
