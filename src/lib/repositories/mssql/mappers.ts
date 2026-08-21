import type {
  Counter,
  Customer,
  SafeUser,
  SystemSettings,
  Token,
  TokenEvent,
  TokenEventType,
  TokenStatus,
  TokenWithRelations,
  User,
  UserRole,
  Vehicle,
  VehicleStatus,
  TestDriveType,
} from "@/types";

export function bitToBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toIsoRequired(value: Date | string): string {
  return toIso(value) ?? new Date().toISOString();
}

/** Normalize DATE / string to YYYY-MM-DD */
export function toBusinessDate(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.passwordHash),
    role: row.role as UserRole,
    active: bitToBool(row.active),
    createdAt: toIsoRequired(row.createdAt as Date | string),
    updatedAt: toIsoRequired(row.updatedAt as Date | string),
  };
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

export function mapSafeUser(row: Record<string, unknown> | null | undefined): SafeUser | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: row.role as UserRole,
    active: bitToBool(row.active),
  };
}

export function mapVehicle(row: Record<string, unknown>): Vehicle {
  return {
    id: String(row.id),
    brand: String(row.brand),
    model: String(row.model),
    registrationNumber: row.registrationNumber != null ? String(row.registrationNumber) : null,
    status: row.status as VehicleStatus,
    active: bitToBool(row.active),
    createdAt: toIsoRequired(row.createdAt as Date | string),
    updatedAt: toIsoRequired(row.updatedAt as Date | string),
  };
}

export function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    contactNumber: String(row.contactNumber),
    nic: row.nic != null ? String(row.nic) : null,
    email: row.email != null ? String(row.email) : null,
    createdAt: toIsoRequired(row.createdAt as Date | string),
    updatedAt: toIsoRequired(row.updatedAt as Date | string),
  };
}

export function mapCounter(row: Record<string, unknown>): Counter {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    active: bitToBool(row.active),
    createdAt: toIsoRequired(row.createdAt as Date | string),
    updatedAt: toIsoRequired(row.updatedAt as Date | string),
  };
}

export function mapSettings(row: Record<string, unknown>): SystemSettings {
  return {
    id: String(row.id),
    companyName: String(row.companyName),
    tokenPrefix: String(row.tokenPrefix ?? ""),
    startingTokenNumber: Number(row.startingTokenNumber),
    maxTokenNumber: Number(row.maxTokenNumber),
    customerCodePrefix: String(row.customerCodePrefix ?? "C"),
    defaultCounterId: String(row.defaultCounterId),
    audioNotificationEnabled: bitToBool(row.audioNotificationEnabled),
    textToSpeechEnabled: bitToBool(row.textToSpeechEnabled),
    displayMode: row.displayMode as SystemSettings["displayMode"],
    queueBehavior: "FIFO",
    autoCompleteOnNext: bitToBool(row.autoCompleteOnNext),
    upcomingTokensCount: Number(row.upcomingTokensCount),
    displayShowCustomerName: bitToBool(row.displayShowCustomerName),
    timezone: String(row.timezone ?? "Asia/Colombo"),
    updatedAt: toIsoRequired(row.updatedAt as Date | string),
  };
}

export function mapToken(row: Record<string, unknown>): Token {
  const businessDate =
    row.businessDateStr != null
      ? String(row.businessDateStr).slice(0, 10)
      : toBusinessDate(row.businessDate as Date | string);

  return {
    id: String(row.id),
    tokenNumber: String(row.tokenNumber),
    tokenPrefix: String(row.tokenPrefix ?? ""),
    sequenceNumber: Number(row.sequenceNumber),
    customerCode: String(row.customerCode),
    businessDate,
    customerId: String(row.customerId),
    vehicleId: String(row.vehicleId),
    testDriveType: row.testDriveType as TestDriveType,
    status: row.status as TokenStatus,
    counterId: row.counterId != null ? String(row.counterId) : null,
    issuedBy: String(row.issuedBy),
    calledBy: row.calledBy != null ? String(row.calledBy) : null,
    notes: row.notes != null ? String(row.notes) : null,
    skipReason: row.skipReason != null ? String(row.skipReason) : null,
    cancellationReason:
      row.cancellationReason != null ? String(row.cancellationReason) : null,
    cancelledBy: row.cancelledBy != null ? String(row.cancelledBy) : null,
    issuedAt: toIsoRequired(row.issuedAt as Date | string),
    calledAt: toIso(row.calledAt as Date | string | null),
    startedAt: toIso(row.startedAt as Date | string | null),
    completedAt: toIso(row.completedAt as Date | string | null),
    skippedAt: toIso(row.skippedAt as Date | string | null),
    cancelledAt: toIso(row.cancelledAt as Date | string | null),
    recallCount: Number(row.recallCount ?? 0),
    lastRecalledAt: toIso(row.lastRecalledAt as Date | string | null),
    createdAt: toIsoRequired(row.createdAt as Date | string),
    updatedAt: toIsoRequired(row.updatedAt as Date | string),
  };
}

export function mapTokenEvent(row: Record<string, unknown>): TokenEvent {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata != null) {
    if (typeof row.metadata === "string") {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    } else if (typeof row.metadata === "object") {
      metadata = row.metadata as Record<string, unknown>;
    }
  }

  return {
    id: String(row.id),
    tokenId: String(row.tokenId),
    eventType: row.eventType as TokenEventType,
    fromStatus: (row.fromStatus as TokenStatus | null) ?? null,
    toStatus: (row.toStatus as TokenStatus | null) ?? null,
    performedBy: row.performedBy != null ? String(row.performedBy) : null,
    reason: row.reason != null ? String(row.reason) : null,
    metadata,
    createdAt: toIsoRequired(row.createdAt as Date | string),
  };
}

const ENRICH_SELECT = `
  t.id, t.tokenNumber, t.tokenPrefix, t.sequenceNumber, t.customerCode,
  CONVERT(varchar(10), t.businessDate, 23) AS businessDateStr,
  t.customerId, t.vehicleId, t.testDriveType, t.status, t.counterId,
  t.issuedBy, t.calledBy, t.notes, t.skipReason, t.cancellationReason, t.cancelledBy,
  t.issuedAt, t.calledAt, t.startedAt, t.completedAt, t.skippedAt, t.cancelledAt,
  t.recallCount, t.lastRecalledAt, t.createdAt, t.updatedAt,
  c.id AS c_id, c.name AS c_name, c.contactNumber AS c_contactNumber,
  c.nic AS c_nic, c.email AS c_email, c.createdAt AS c_createdAt, c.updatedAt AS c_updatedAt,
  v.id AS v_id, v.brand AS v_brand, v.model AS v_model,
  v.registrationNumber AS v_registrationNumber, v.status AS v_status, v.active AS v_active,
  v.createdAt AS v_createdAt, v.updatedAt AS v_updatedAt,
  ctr.id AS ctr_id, ctr.name AS ctr_name, ctr.code AS ctr_code, ctr.active AS ctr_active,
  ctr.createdAt AS ctr_createdAt, ctr.updatedAt AS ctr_updatedAt,
  iu.id AS iu_id, iu.email AS iu_email, iu.name AS iu_name, iu.role AS iu_role, iu.active AS iu_active,
  cu.id AS cu_id, cu.email AS cu_email, cu.name AS cu_name, cu.role AS cu_role, cu.active AS cu_active
`;

export const TOKEN_ENRICH_FROM = `
  FROM dbo.tokens t
  INNER JOIN dbo.customers c ON c.id = t.customerId
  INNER JOIN dbo.vehicles v ON v.id = t.vehicleId
  LEFT JOIN dbo.counters ctr ON ctr.id = t.counterId
  LEFT JOIN dbo.users iu ON iu.id = t.issuedBy
  LEFT JOIN dbo.users cu ON cu.id = t.calledBy
`;

export { ENRICH_SELECT };

export function mapEnrichedToken(row: Record<string, unknown>): TokenWithRelations {
  const token = mapToken(row);
  const customer: Customer = {
    id: String(row.c_id),
    name: String(row.c_name),
    contactNumber: String(row.c_contactNumber),
    nic: row.c_nic != null ? String(row.c_nic) : null,
    email: row.c_email != null ? String(row.c_email) : null,
    createdAt: toIsoRequired(row.c_createdAt as Date | string),
    updatedAt: toIsoRequired(row.c_updatedAt as Date | string),
  };
  const vehicle: Vehicle = {
    id: String(row.v_id),
    brand: String(row.v_brand),
    model: String(row.v_model),
    registrationNumber:
      row.v_registrationNumber != null ? String(row.v_registrationNumber) : null,
    status: row.v_status as VehicleStatus,
    active: bitToBool(row.v_active),
    createdAt: toIsoRequired(row.v_createdAt as Date | string),
    updatedAt: toIsoRequired(row.v_updatedAt as Date | string),
  };
  const counter: Counter | null = row.ctr_id
    ? {
        id: String(row.ctr_id),
        name: String(row.ctr_name),
        code: String(row.ctr_code),
        active: bitToBool(row.ctr_active),
        createdAt: toIsoRequired(row.ctr_createdAt as Date | string),
        updatedAt: toIsoRequired(row.ctr_updatedAt as Date | string),
      }
    : null;

  return {
    ...token,
    customer,
    vehicle,
    counter,
    issuer: mapSafeUser(
      row.iu_id
        ? {
            id: row.iu_id,
            email: row.iu_email,
            name: row.iu_name,
            role: row.iu_role,
            active: row.iu_active,
          }
        : null
    ),
    caller: mapSafeUser(
      row.cu_id
        ? {
            id: row.cu_id,
            email: row.cu_email,
            name: row.cu_name,
            role: row.cu_role,
            active: row.cu_active,
          }
        : null
    ),
  };
}
