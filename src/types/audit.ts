import type { DatabaseTimestamp } from "@/types/database";

export const AUDIT_ACTIONS = [
  "ORGANIZATION_CREATED",
  "ORGANIZATION_SUSPENDED",
  "ORGANIZATION_REACTIVATED",
  "LOCATION_CREATED",
  "CINEMA_ADMIN_CREATED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  "ORGANIZATION",
  "LOCATION",
  "USER",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AuditMetadataValue = string | number | boolean | null;

export interface AuditLog {
  id: string;
  actorUid: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  organizationId: string | null;
  metadata: Record<string, AuditMetadataValue>;
  createdAt: DatabaseTimestamp;
}

export type AuditLogDocument = Omit<AuditLog, "id">;
