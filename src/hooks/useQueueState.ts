"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import type { DashboardStats, QueueSnapshot, RealtimeEvent } from "@/types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || "Request failed");
  }
  return json.data as T;
}

/**
 * Central queue state hook.
 * Uses SSE with polling fallback — swap transport without changing pages.
 */
export function useQueueState(options?: {
  counter?: string;
  enableStats?: boolean;
  pollIntervalMs?: number;
}) {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const versionRef = useRef(0);

  const counterQuery = options?.counter
    ? `?counter=${encodeURIComponent(options.counter)}`
    : "";

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<QueueSnapshot>(`/api/queue${counterQuery}`);
      setSnapshot((prev) => {
        if (prev && typeof data.version === "number" && data.version < prev.version) {
          return prev;
        }
        return data;
      });
      setError(null);
      if (options?.enableStats) {
        try {
          const s = await fetchJson<DashboardStats>("/api/stats");
          setStats(s);
        } catch {
          // stats optional for public display
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [counterQuery, options?.enableStats]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime via SSE (LAN) or polling (Vercel serverless)
  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let usePolling = false;
    const onVercel = Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV);

    const startPolling = () => {
      if (pollTimer) return;
      usePolling = true;
      setConnected(false);
      pollTimer = setInterval(() => {
        void refresh();
      }, options?.pollIntervalMs ?? POLL_INTERVAL_MS);
    };

    if (onVercel) {
      startPolling();
    } else {
      try {
        es = new EventSource("/api/realtime");
        es.onopen = () => {
          setConnected(true);
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        };
        es.onmessage = (msg) => {
          try {
            const event = JSON.parse(msg.data) as RealtimeEvent;
            setLastEvent(event);
            if (
              event.type === "QUEUE_UPDATED" ||
              event.type === "TOKEN_RECALLED" ||
              event.type === "SETTINGS_UPDATED"
            ) {
              void refresh();
            }
            if (event.type === "HEARTBEAT") {
              const payload = event.payload as { version?: number };
              if (
                typeof payload.version === "number" &&
                payload.version !== versionRef.current
              ) {
                versionRef.current = payload.version;
                void refresh();
              }
            }
          } catch {
            // ignore malformed
          }
        };
        es.onerror = () => {
          es?.close();
          startPolling();
        };
      } catch {
        startPolling();
      }

      if (!usePolling) {
        pollTimer = setInterval(() => {
          void refresh();
        }, Math.max(options?.pollIntervalMs ?? POLL_INTERVAL_MS, 5000));
      }
    }

    return () => {
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [refresh, options?.pollIntervalMs]);

  return {
    snapshot,
    stats,
    loading,
    error,
    connected,
    lastEvent,
    refresh,
  };
}

export function useRealtimeQueue(counter?: string) {
  return useQueueState({ counter, enableStats: false });
}

export async function queueAction(
  action: "NEXT" | "COMPLETE" | "RECALL" | "SKIP" | "CANCEL",
  body?: Record<string, unknown>
) {
  return fetchJson("/api/queue", {
    method: "POST",
    body: JSON.stringify({ action, ...body }),
  });
}

export async function issueTokenApi(payload: Record<string, unknown>) {
  return fetchJson("/api/tokens", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
