import type { TestDriveType, TokenStatus, UserRole } from "@/types";

export const APP_NAME = "Indra Traders Test Drive";
export const COMPANY_NAME = "Indra Traders (PVT) LTD";
export const TIMEZONE = "Asia/Colombo";

export const DEMO_PASSWORD = "demo1234";

export const TOKEN_STATUS_LABELS: Record<TokenStatus, string> = {
  WAITING: "Waiting",
  CALLED: "Called",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

export const TEST_DRIVE_TYPE_LABELS: Record<TestDriveType, string> = {
  NORMAL: "Normal Test Drive",
  VIP: "VIP Test Drive",
  SCHEDULED: "Scheduled Test Drive",
  WALK_IN: "Walk-in Test Drive",
};

/** Static display order — Normal is always first / default */
export const TEST_DRIVE_TYPE_OPTIONS: TestDriveType[] = [
  "NORMAL",
  "VIP",
  "SCHEDULED",
  "WALK_IN",
];

export const DEFAULT_TEST_DRIVE_TYPE: TestDriveType = "NORMAL";

/** Floor staff roles — same login may be used on multiple devices */
export const FLOOR_ROLES: UserRole[] = [
  "ADMIN",
  "TOKEN_OFFICER",
  "QUEUE_OFFICER",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrator",
  TOKEN_OFFICER: "Token Officer",
  QUEUE_OFFICER: "Queue Officer",
};

export const SKIP_REASONS = [
  "Customer not present",
  "Customer requested delay",
  "Other",
] as const;

export const CANCEL_REASONS = [
  "Customer cancelled",
  "Vehicle unavailable",
  "Duplicate token",
  "Other",
] as const;

export const POLL_INTERVAL_MS = 2000;
/** Slower polling on Vercel to avoid exhausting Supabase connection pools */
export const VERCEL_POLL_INTERVAL_MS = 8000;

/** Max simultaneous test drives — matches Colombo fleet size */
export const DEFAULT_MAX_CONCURRENT_ACTIVE = 6;
