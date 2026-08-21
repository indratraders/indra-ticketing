import { vehicleDisplayName } from "@/lib/utils";
import { formatSriLankaDate, formatSriLankaTime } from "@/lib/utils/date";
import type { TokenWithRelations } from "@/types";

export function PrintableToken({ token }: { token: TokenWithRelations }) {
  return (
    <div className="print-token rounded-2xl border border-[var(--border)] bg-white p-6 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--brand-gold)]">
        Indra Traders
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        Test Drive
      </p>
      <div className="my-5 border-y border-dashed border-[var(--border)] py-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Your Token
        </p>
        <p className="font-display mt-2 text-5xl font-bold tracking-tight">
          {token.tokenNumber}
        </p>
        <p className="mt-3 text-sm font-semibold tracking-wide text-[var(--foreground)]">
          Code: {token.customerCode}
        </p>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-[var(--muted)]">Vehicle: </span>
          {vehicleDisplayName(token.vehicle.brand, token.vehicle.model)}
        </p>
        <p>
          <span className="text-[var(--muted)]">Customer: </span>
          {token.customer.name}
        </p>
        <p>
          <span className="text-[var(--muted)]">Date: </span>
          {formatSriLankaDate(token.issuedAt)}
        </p>
        <p>
          <span className="text-[var(--muted)]">Time: </span>
          {formatSriLankaTime(token.issuedAt)}
        </p>
      </div>
      <p className="mt-5 text-sm text-[var(--muted)]">
        Please wait until your token is called.
      </p>
      <p className="mt-3 text-xs font-medium">
        Thank you for choosing Indra Traders.
      </p>
    </div>
  );
}
