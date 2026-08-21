/** Shared domain types for Indra Traders Test Drive Ticketing */

export type UserRole = "ADMIN" | "TOKEN_OFFICER" | "QUEUE_OFFICER";

export type TokenStatus =
  | "WAITING"
  | "CALLED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED"
  | "NO_SHOW";

export type VehicleStatus =
  | "AVAILABLE"
  | "IN_TEST_DRIVE"
  | "MAINTENANCE"
  | "UNAVAILABLE";

export type TestDriveType =
  | "NORMAL"
  | "VIP"
  | "SCHEDULED"
  | "WALK_IN";

export type TokenEventType =
  | "ISSUED"
  | "CALLED"
  | "STARTED"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED"
  | "RECALLED"
  | "NO_SHOW"
  | "STATUS_CHANGED";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  registrationNumber: string | null;
  status: VehicleStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  contactNumber: string;
  nic: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Counter {
  id: string;
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Token {
  id: string;
  /** Display queue number, cycles 1–50 (e.g. "1", "50") */
  tokenNumber: string;
  tokenPrefix: string;
  sequenceNumber: number;
  /** Unique customer reference that never cycles (e.g. "C0001") */
  customerCode: string;
  businessDate: string; // YYYY-MM-DD in Asia/Colombo
  customerId: string;
  vehicleId: string;
  testDriveType: TestDriveType;
  status: TokenStatus;
  counterId: string | null;
  issuedBy: string;
  calledBy: string | null;
  notes: string | null;
  skipReason: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  issuedAt: string;
  calledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  cancelledAt: string | null;
  recallCount: number;
  lastRecalledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenEvent {
  id: string;
  tokenId: string;
  eventType: TokenEventType;
  fromStatus: TokenStatus | null;
  toStatus: TokenStatus | null;
  performedBy: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DailySequence {
  id: string;
  businessDate: string;
  prefix: string;
  lastSequence: number;
  counterId: string | null;
}

export interface SystemSettings {
  id: string;
  companyName: string;
  /** Kept for compatibility; display tokens no longer use a letter prefix */
  tokenPrefix: string;
  startingTokenNumber: number;
  /** Queue display numbers cycle from startingTokenNumber to this value */
  maxTokenNumber: number;
  /** Prefix for unique customer codes, e.g. C → C0001 */
  customerCodePrefix: string;
  defaultCounterId: string;
  audioNotificationEnabled: boolean;
  textToSpeechEnabled: boolean;
  displayMode: "STANDARD" | "COMPACT" | "LARGE";
  queueBehavior: "FIFO";
  autoCompleteOnNext: boolean;
  upcomingTokensCount: number;
  displayShowCustomerName: boolean;
  timezone: string;
  updatedAt: string;
}

export interface TokenWithRelations extends Token {
  customer: Customer;
  vehicle: Vehicle;
  counter: Counter | null;
  issuer: SafeUser | null;
  caller: SafeUser | null;
}

export interface QueueSnapshot {
  /** @deprecated Prefer activeTokens — kept as first/oldest active for compatibility */
  currentToken: TokenWithRelations | null;
  /** All CALLED / IN_PROGRESS tokens (up to maxConcurrentActive) */
  activeTokens: TokenWithRelations[];
  waitingTokens: TokenWithRelations[];
  completedTokens: TokenWithRelations[];
  skippedTokens: TokenWithRelations[];
  cancelledTokens: TokenWithRelations[];
  previousToken: TokenWithRelations | null;
  upcomingTokens: TokenWithRelations[];
  waitingCount: number;
  activeCount: number;
  maxConcurrentActive: number;
  recallVersion: number;
  updatedAt: string;
}

export interface DashboardStats {
  issued: number;
  waiting: number;
  inProgress: number;
  completed: number;
  skipped: number;
  cancelled: number;
  averageWaitingMinutes: number | null;
  averageTestDriveMinutes: number | null;
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  exp: number;
}

export interface IssueTokenInput {
  customerName: string;
  contactNumber: string;
  vehicleId?: string;
  customVehicleName?: string;
  testDriveType: TestDriveType;
  nic?: string;
  email?: string;
  notes?: string;
  counterId?: string;
}

export interface SkipTokenInput {
  tokenId: string;
  reason?: string;
}

export interface CancelTokenInput {
  tokenId: string;
  reason?: string;
}

export interface RealtimeEvent {
  type: "QUEUE_UPDATED" | "TOKEN_RECALLED" | "SETTINGS_UPDATED" | "HEARTBEAT";
  payload: unknown;
  timestamp: string;
}

export interface ReportSummary {
  dailyTokenCount: { date: string; count: number }[];
  vehicleWise: { vehicle: string; count: number }[];
  hourlyVolume: { hour: string; count: number }[];
  statusBreakdown: { status: TokenStatus; count: number }[];
  officerActivity: { officer: string; issued: number; called: number }[];
  averageWaitingMinutes: number | null;
  averageTestDriveMinutes: number | null;
  completed: number;
  cancelled: number;
}
