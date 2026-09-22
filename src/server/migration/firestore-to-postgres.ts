import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/types/audit";
import { hallDocumentSchema } from "@/validation/hall";
import { locationDocumentSchema } from "@/validation/location";
import { organizationDocumentSchema } from "@/validation/organization";
import { seatDocumentSchema } from "@/validation/seat";
import { userProfileDocumentSchema } from "@/validation/user";
import { databaseTimestampSchema, documentIdSchema } from "@/validation/shared";
import { z } from "zod";

export interface LegacyDocument {
  id: string;
  data: unknown;
}

export interface LegacyLocationDocument extends LegacyDocument {
  organizationId: string;
}

export interface LegacyHallDocument extends LegacyLocationDocument {
  locationId: string;
}

export interface LegacySeatDocument extends LegacyHallDocument {
  hallId: string;
}

export interface LegacyFirestoreSource {
  organizations: LegacyDocument[];
  locations: LegacyLocationDocument[];
  halls: LegacyHallDocument[];
  seats: LegacySeatDocument[];
  users: LegacyDocument[];
  auditLogs: LegacyDocument[];
}

const safeMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const auditLogMigrationSchema = z
  .object({
    actorUid: documentIdSchema,
    action: z.enum(AUDIT_ACTIONS),
    entityType: z.enum(AUDIT_ENTITY_TYPES),
    entityId: documentIdSchema,
    organizationId: documentIdSchema.nullable(),
    metadata: z.record(z.string(), safeMetadataValueSchema),
    createdAt: databaseTimestampSchema,
  })
  .strict();

function membershipId(firebaseUid: string, organizationId: string): string {
  return `membership:${firebaseUid}:${organizationId}`;
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function assertUnique(label: string, values: readonly string[]): void {
  const duplicates = duplicateValues(values);
  if (duplicates.length > 0) {
    throw new MigrationValidationError(
      `${label} contains duplicate keys: ${duplicates.slice(0, 5).join(", ")}.`,
    );
  }
}

export class MigrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationValidationError";
  }
}

export class MigrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationConflictError";
  }
}

export interface MigrationPlan {
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
    createdAt: Date;
    updatedAt: Date;
  }>;
  locations: Array<{
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    addressLine1: string;
    addressLine2: string | null;
    postalCode: string | null;
    city: string;
    country: string;
    timezone: string;
    status: "ACTIVE" | "INACTIVE";
    createdAt: Date;
    updatedAt: Date;
  }>;
  halls: Array<{
    id: string;
    locationId: string;
    name: string;
    number: number;
    status: "ACTIVE" | "INACTIVE";
    createdAt: Date;
    updatedAt: Date;
  }>;
  seats: Array<{
    id: string;
    hallId: string;
    row: string;
    number: number;
    label: string;
    status: "ACTIVE" | "DISABLED";
    createdAt: Date;
    updatedAt: Date;
  }>;
  users: Array<{
    id: string;
    firebaseUid: string;
    email: string;
    displayName: string;
    active: boolean;
    platformRole: "USER" | "SUPER_ADMIN";
    createdAt: Date;
    updatedAt: Date;
  }>;
  memberships: Array<{
    id: string;
    userId: string;
    organizationId: string;
    role: "CINEMA_ADMIN" | "LOCATION_MANAGER" | "KITCHEN_STAFF" | "DELIVERY_STAFF";
    allLocations: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  locationAccess: Array<{
    membershipId: string;
    locationId: string;
    organizationId: string;
  }>;
  auditLogs: Array<{
    id: string;
    actorUserId: string | null;
    action: (typeof AUDIT_ACTIONS)[number];
    entityType: (typeof AUDIT_ENTITY_TYPES)[number];
    entityId: string;
    organizationId: string | null;
    locationId: string | null;
    hallId: string | null;
    metadata: Record<string, string | number | boolean | null>;
    createdAt: Date;
  }>;
}

export type MigrationCounts = {
  [K in keyof MigrationPlan]: number;
};

export function migrationCounts(plan: MigrationPlan): MigrationCounts {
  return {
    organizations: plan.organizations.length,
    locations: plan.locations.length,
    halls: plan.halls.length,
    seats: plan.seats.length,
    users: plan.users.length,
    memberships: plan.memberships.length,
    locationAccess: plan.locationAccess.length,
    auditLogs: plan.auditLogs.length,
  };
}

export function buildMigrationPlan(source: LegacyFirestoreSource): MigrationPlan {
  const organizations = source.organizations.map((document) => {
    const data = organizationDocumentSchema.parse(document.data);
    return {
      id: documentIdSchema.parse(document.id),
      name: data.name,
      slug: data.slug,
      status: data.status,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    };
  });
  assertUnique("Organization IDs", organizations.map(({ id }) => id));
  assertUnique("Organization slugs", organizations.map(({ slug }) => slug));
  const organizationIds = new Set(organizations.map(({ id }) => id));

  const locations = source.locations.map((document) => {
    const organizationId = documentIdSchema.parse(document.organizationId);
    if (!organizationIds.has(organizationId)) {
      throw new MigrationValidationError(
        `Location ${document.id} references missing organization ${organizationId}.`,
      );
    }
    const data = locationDocumentSchema.parse(document.data);
    return {
      id: documentIdSchema.parse(document.id),
      organizationId,
      name: data.name,
      slug: data.slug,
      addressLine1: data.address.line1,
      addressLine2: data.address.line2 ?? null,
      postalCode: data.address.postalCode ?? null,
      city: data.city,
      country: data.country,
      timezone: data.timezone,
      status: data.status,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    };
  });
  assertUnique("Location IDs", locations.map(({ id }) => id));
  assertUnique(
    "Organization/location slugs",
    locations.map(({ organizationId, slug }) => `${organizationId}:${slug}`),
  );
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  const halls = source.halls.map((document) => {
    const organizationId = documentIdSchema.parse(document.organizationId);
    const locationId = documentIdSchema.parse(document.locationId);
    const location = locationsById.get(locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new MigrationValidationError(
        `Hall ${document.id} references an invalid location hierarchy.`,
      );
    }
    const data = hallDocumentSchema.parse(document.data);
    return {
      id: documentIdSchema.parse(document.id),
      locationId,
      name: data.name,
      number: data.number,
      status: data.status,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    };
  });
  assertUnique("Hall IDs", halls.map(({ id }) => id));
  assertUnique(
    "Location/hall numbers",
    halls.map(({ locationId, number }) => `${locationId}:${number}`),
  );
  const hallsById = new Map(halls.map((hall) => [hall.id, hall]));

  const seats = source.seats.map((document) => {
    const organizationId = documentIdSchema.parse(document.organizationId);
    const locationId = documentIdSchema.parse(document.locationId);
    const hallId = documentIdSchema.parse(document.hallId);
    const hall = hallsById.get(hallId);
    const location = locationsById.get(locationId);
    if (
      !hall ||
      hall.locationId !== locationId ||
      !location ||
      location.organizationId !== organizationId
    ) {
      throw new MigrationValidationError(
        `Seat ${document.id} references an invalid hall hierarchy.`,
      );
    }
    const data = seatDocumentSchema.parse(document.data);
    return {
      id: documentIdSchema.parse(document.id),
      hallId,
      row: data.row,
      number: data.number,
      label: data.label,
      status: data.status,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    };
  });
  assertUnique(
    "Hall/seat IDs",
    seats.map(({ hallId, id }) => `${hallId}:${id}`),
  );
  assertUnique(
    "Hall/seat labels",
    seats.map(({ hallId, label }) => `${hallId}:${label}`),
  );

  const users: MigrationPlan["users"] = [];
  const memberships: MigrationPlan["memberships"] = [];
  const locationAccess: MigrationPlan["locationAccess"] = [];
  for (const document of source.users) {
    const firebaseUid = documentIdSchema.parse(document.id);
    const profile = userProfileDocumentSchema.parse(document.data);
    users.push({
      id: firebaseUid,
      firebaseUid,
      email: profile.email.toLowerCase(),
      displayName: profile.displayName,
      active: profile.active,
      platformRole: profile.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER",
      createdAt: profile.createdAt.toDate(),
      updatedAt: profile.updatedAt.toDate(),
    });

    if (profile.role !== "SUPER_ADMIN") {
      const organizationId = profile.organizationId;
      if (!organizationId || !organizationIds.has(organizationId)) {
        throw new MigrationValidationError(
          `User ${firebaseUid} references a missing organization.`,
        );
      }
      const id = membershipId(firebaseUid, organizationId);
      memberships.push({
        id,
        userId: firebaseUid,
        organizationId,
        role: profile.role,
        allLocations: profile.allLocations,
        createdAt: profile.createdAt.toDate(),
        updatedAt: profile.updatedAt.toDate(),
      });
      for (const locationId of profile.locationIds) {
        const location = locationsById.get(locationId);
        if (!location || location.organizationId !== organizationId) {
          throw new MigrationValidationError(
            `User ${firebaseUid} references unauthorized or missing location ${locationId}.`,
          );
        }
        locationAccess.push({ membershipId: id, locationId, organizationId });
      }
    }
  }
  assertUnique("Firebase UIDs", users.map(({ firebaseUid }) => firebaseUid));
  assertUnique("Normalized emails", users.map(({ email }) => email));
  assertUnique(
    "User/organization memberships",
    memberships.map(({ userId, organizationId }) => `${userId}:${organizationId}`),
  );
  assertUnique(
    "Membership/location access",
    locationAccess.map(({ membershipId: id, locationId }) => `${id}:${locationId}`),
  );
  const userIds = new Set(users.map(({ id }) => id));

  const auditLogs = source.auditLogs.map((document) => {
    const data = auditLogMigrationSchema.parse(document.data);
    const metadataLocationId =
      typeof data.metadata.locationId === "string" ? data.metadata.locationId : null;
    const metadataHallId =
      typeof data.metadata.hallId === "string" ? data.metadata.hallId : null;
    const locationId =
      data.entityType === "LOCATION" ? data.entityId : metadataLocationId;
    const hallId = data.entityType === "HALL" ? data.entityId : metadataHallId;
    return {
      id: documentIdSchema.parse(document.id),
      actorUserId: userIds.has(data.actorUid) ? data.actorUid : null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      organizationId:
        data.organizationId && organizationIds.has(data.organizationId)
          ? data.organizationId
          : null,
      locationId: locationId && locationsById.has(locationId) ? locationId : null,
      hallId: hallId && hallsById.has(hallId) ? hallId : null,
      metadata: data.metadata,
      createdAt: data.createdAt.toDate(),
    };
  });
  assertUnique("Audit log IDs", auditLogs.map(({ id }) => id));

  return {
    organizations,
    locations,
    halls,
    seats,
    users,
    memberships,
    locationAccess,
    auditLogs,
  };
}

function countsEqual(left: MigrationCounts, right: MigrationCounts): boolean {
  return (Object.keys(left) as Array<keyof MigrationCounts>).every(
    (key) => left[key] === right[key],
  );
}

async function currentPostgresCounts(): Promise<MigrationCounts> {
  const [organizations, locations, halls, seats, users, memberships, locationAccess, auditLogs] =
    await prisma.$transaction([
      prisma.organization.count(),
      prisma.location.count(),
      prisma.hall.count(),
      prisma.seat.count(),
      prisma.user.count(),
      prisma.organizationMembership.count(),
      prisma.locationAccess.count(),
      prisma.auditLog.count(),
    ]);
  return { organizations, locations, halls, seats, users, memberships, locationAccess, auditLogs };
}

async function destinationMatches(plan: MigrationPlan): Promise<boolean> {
  const [organizations, locations, halls, seats, users, memberships, access, audits] =
    await prisma.$transaction([
      prisma.organization.findMany({ select: { id: true } }),
      prisma.location.findMany({ select: { id: true } }),
      prisma.hall.findMany({ select: { id: true } }),
      prisma.seat.findMany({ select: { hallId: true, id: true } }),
      prisma.user.findMany({ select: { firebaseUid: true } }),
      prisma.organizationMembership.findMany({ select: { userId: true, organizationId: true } }),
      prisma.locationAccess.findMany({ select: { membershipId: true, locationId: true } }),
      prisma.auditLog.findMany({ select: { id: true } }),
    ]);
  const same = (actual: string[], expected: string[]) =>
    actual.length === expected.length &&
    actual.sort().every((value, index) => value === expected.sort()[index]);
  return (
    same(organizations.map(({ id }) => id), plan.organizations.map(({ id }) => id)) &&
    same(locations.map(({ id }) => id), plan.locations.map(({ id }) => id)) &&
    same(halls.map(({ id }) => id), plan.halls.map(({ id }) => id)) &&
    same(seats.map(({ hallId, id }) => `${hallId}:${id}`), plan.seats.map(({ hallId, id }) => `${hallId}:${id}`)) &&
    same(users.map(({ firebaseUid }) => firebaseUid), plan.users.map(({ firebaseUid }) => firebaseUid)) &&
    same(memberships.map(({ userId, organizationId }) => `${userId}:${organizationId}`), plan.memberships.map(({ userId, organizationId }) => `${userId}:${organizationId}`)) &&
    same(access.map(({ membershipId: id, locationId }) => `${id}:${locationId}`), plan.locationAccess.map(({ membershipId: id, locationId }) => `${id}:${locationId}`)) &&
    same(audits.map(({ id }) => id), plan.auditLogs.map(({ id }) => id))
  );
}

export interface ApplyMigrationResult {
  counts: MigrationCounts;
  alreadyApplied: boolean;
}

export async function applyMigrationPlan(plan: MigrationPlan): Promise<ApplyMigrationResult> {
  const expected = migrationCounts(plan);
  const existing = await currentPostgresCounts();
  const empty = Object.values(existing).every((count) => count === 0);

  if (!empty) {
    if (countsEqual(existing, expected) && (await destinationMatches(plan))) {
      return { counts: existing, alreadyApplied: true };
    }
    throw new MigrationConflictError(
      "PostgreSQL is not empty and does not exactly match the migration plan. No writes were attempted.",
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      if (plan.organizations.length) await transaction.organization.createMany({ data: plan.organizations });
      if (plan.locations.length) await transaction.location.createMany({ data: plan.locations });
      if (plan.halls.length) await transaction.hall.createMany({ data: plan.halls });
      if (plan.seats.length) await transaction.seat.createMany({ data: plan.seats });
      if (plan.users.length) await transaction.user.createMany({ data: plan.users });
      if (plan.memberships.length) await transaction.organizationMembership.createMany({ data: plan.memberships });
      if (plan.locationAccess.length) await transaction.locationAccess.createMany({ data: plan.locationAccess });
      if (plan.auditLogs.length) {
        await transaction.auditLog.createMany({
          data: plan.auditLogs.map((audit) => ({
            ...audit,
            metadata: audit.metadata as Prisma.InputJsonValue,
          })),
        });
      }
    }, { isolationLevel: "Serializable", timeout: 120_000 });
  } catch (error) {
    if (isPrismaError(error, "P2002") || isPrismaError(error, "P2003")) {
      throw new MigrationConflictError(
        "PostgreSQL rejected a unique or foreign-key constraint. The migration transaction was rolled back.",
      );
    }
    throw error;
  }

  const counts = await currentPostgresCounts();
  if (!countsEqual(counts, expected)) {
    throw new MigrationValidationError(
      "Post-migration PostgreSQL counts do not match the validated Firestore plan.",
    );
  }
  return { counts, alreadyApplied: false };
}

export interface MigrationRunReport {
  mode: "DRY_RUN" | "APPLY";
  sourceCounts: MigrationCounts;
  postgresCounts: MigrationCounts | null;
  alreadyApplied: boolean;
}

export function createMigrationRunner(dependencies: {
  readSource(): Promise<LegacyFirestoreSource>;
  apply(plan: MigrationPlan): Promise<ApplyMigrationResult>;
}) {
  return async function run(apply: boolean): Promise<MigrationRunReport> {
    const source = await dependencies.readSource();
    const plan = buildMigrationPlan(source);
    const sourceCounts = migrationCounts(plan);

    if (!apply) {
      return {
        mode: "DRY_RUN",
        sourceCounts,
        postgresCounts: null,
        alreadyApplied: false,
      };
    }

    const result = await dependencies.apply(plan);
    if (!countsEqual(sourceCounts, result.counts)) {
      throw new MigrationValidationError(
        "Applied PostgreSQL counts do not match the Firestore migration plan.",
      );
    }
    return {
      mode: "APPLY",
      sourceCounts,
      postgresCounts: result.counts,
      alreadyApplied: result.alreadyApplied,
    };
  };
}
