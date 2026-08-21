"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageLoader } from "@/components/ui/feedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TOKEN_STATUS_LABELS } from "@/lib/constants";
import { formatSriLankaDateTime } from "@/lib/utils/date";
import { vehicleDisplayName } from "@/lib/utils";
import { getBusinessDate } from "@/lib/utils/date";
import type { TokenStatus, TokenWithRelations } from "@/types";
import { Inbox } from "lucide-react";

export default function HistoryPage() {
  return (
    <DashboardShellClient
      allowedRoles={["ADMIN", "TOKEN_OFFICER", "QUEUE_OFFICER"]}
    >
      <HistoryView />
    </DashboardShellClient>
  );
}

function HistoryView() {
  const [date, setDate] = useState(getBusinessDate());
  const [status, setStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<TokenWithRelations[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({
      date,
      page: String(page),
      pageSize: "15",
    });
    if (status !== "ALL") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());

    setLoading(true);
    void fetch(`/api/history?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setItems(json.data.items);
          setTotal(json.data.total);
        }
      })
      .finally(() => setLoading(false));
  }, [date, status, search, page]);

  const totalPages = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Token History</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Search and filter historical test-drive tokens
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setPage(1);
              setDate(e.target.value);
            }}
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setPage(1);
              setStatus(v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {(Object.keys(TOKEN_STATUS_LABELS) as TokenStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {TOKEN_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              className="pl-9"
              placeholder="Search token, customer, vehicle..."
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <PageLoader label="Loading history..." />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No token history found"
              description="Try a different date or clear your search filters."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                    <tr>
                      <th className="pb-3">Token</th>
                      <th className="pb-3">Code</th>
                      <th className="pb-3">Customer</th>
                      <th className="pb-3">Contact</th>
                      <th className="pb-3">Vehicle</th>
                      <th className="pb-3">Issued</th>
                      <th className="pb-3">Called</th>
                      <th className="pb-3">Completed</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Officer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((token) => (
                      <tr
                        key={token.id}
                        className="border-b border-[var(--border)]/70"
                      >
                        <td className="py-3 font-semibold">
                          {token.tokenNumber}
                        </td>
                        <td className="py-3 font-medium text-[var(--muted)]">
                          {token.customerCode}
                        </td>
                        <td className="py-3">{token.customer.name}</td>
                        <td className="py-3">{token.customer.contactNumber}</td>
                        <td className="py-3">
                          {vehicleDisplayName(
                            token.vehicle.brand,
                            token.vehicle.model
                          )}
                        </td>
                        <td className="py-3 text-[var(--muted)]">
                          {formatSriLankaDateTime(token.issuedAt)}
                        </td>
                        <td className="py-3 text-[var(--muted)]">
                          {formatSriLankaDateTime(token.calledAt)}
                        </td>
                        <td className="py-3 text-[var(--muted)]">
                          {formatSriLankaDateTime(token.completedAt)}
                        </td>
                        <td className="py-3">
                          <StatusBadge status={token.status} />
                        </td>
                        <td className="py-3">
                          {token.issuer?.name ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-[var(--muted)]">
                  {total} result{total === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-2 text-sm">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
