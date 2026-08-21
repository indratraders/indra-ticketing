/** Sri Lanka timezone helpers (Asia/Colombo, UTC+5:30) */

const TIMEZONE = "Asia/Colombo";

export function nowISO(): string {
  return new Date().toISOString();
}

export function getBusinessDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatSriLankaDateTime(
  iso: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  }).format(new Date(iso));
}

export function formatSriLankaTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatSriLankaDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatClockNow(): { date: string; time: string } {
  const now = new Date();
  return {
    date: formatSriLankaDate(now.toISOString()),
    time: formatSriLankaTime(now.toISOString()),
  };
}

export function minutesBetween(
  startIso: string | null,
  endIso: string | null
): number | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return null;
  return Math.round(ms / 60000);
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(
    values.reduce((sum, v) => sum + v, 0) / values.length
  );
}
