import "server-only";

import { isPrismaError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import { seatDocumentId, seatRowOrdinal } from "@/lib/tenant-admin/seats";
import {
  toHallDomain,
  toLocationDomain,
  toSeatDomain,
} from "@/server/database/mappers";
import { ServiceError } from "@/server/services/service-error";
import type { Hall } from "@/types/hall";
import type { Location } from "@/types/location";
import type { Seat } from "@/types/seat";
import type { HallStatus, SeatStatus } from "@/types/status";
import { createTenantHallSchema } from "@/validation/hall";
import { createLocationSchema } from "@/validation/location";
import { createSeatSchema } from "@/validation/seat";

const hallRelations = {
  location: { select: { organizationId: true } },
  _count: { select: { seats: true } },
} as const;

const seatRelations = {
  hall: {
    select: {
      locationId: true,
      location: { select: { organizationId: true } },
    },
  },
} as const;

async function actorUserId(firebaseUid: string): Promise<string> {
  const actor = await prisma.user.findUnique({
    where: { firebaseUid },
    select: { id: true },
  });
  if (!actor) {
    throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  }
  return actor.id;
}

export async function listTenantLocations(
  organizationId: string,
  permittedLocationIds: readonly string[] | null,
): Promise<Location[]> {
  if (permittedLocationIds !== null && permittedLocationIds.length === 0) return [];
  const locations = await prisma.location.findMany({
    where: {
      organizationId,
      ...(permittedLocationIds === null
        ? {}
        : { id: { in: [...permittedLocationIds] } }),
    },
    orderBy: { name: "asc" },
  });
  return locations.map(toLocationDomain);
}

export async function getTenantLocation(
  organizationId: string,
  locationId: string,
): Promise<Location | null> {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId },
  });
  return location ? toLocationDomain(location) : null;
}

export async function listLocationHalls(
  organizationId: string,
  locationId: string,
): Promise<Hall[]> {
  const halls = await prisma.hall.findMany({
    where: { locationId, location: { organizationId } },
    include: hallRelations,
    orderBy: { number: "asc" },
  });
  return halls.map(toHallDomain);
}

export async function getLocationHall(
  organizationId: string,
  locationId: string,
  hallId: string,
): Promise<Hall | null> {
  const hall = await prisma.hall.findFirst({
    where: { id: hallId, locationId, location: { organizationId } },
    include: hallRelations,
  });
  return hall ? toHallDomain(hall) : null;
}

export async function listHallSeats(
  organizationId: string,
  locationId: string,
  hallId: string,
): Promise<Seat[]> {
  const seats = await prisma.seat.findMany({
    where: {
      hallId,
      hall: { locationId, location: { organizationId } },
    },
    include: seatRelations,
  });
  return seats
    .map(toSeatDomain)
    .sort((left, right) =>
      left.row === right.row
        ? left.number - right.number
        : seatRowOrdinal(left.row) - seatRowOrdinal(right.row),
    );
}

export interface CreateTenantLocationRecordInput {
  actorUid: string;
  organizationId: string;
  locationId: string;
  auditLogId: string;
  location: ReturnType<typeof createLocationSchema.parse>;
}

export async function createTenantLocationRecord(
  input: CreateTenantLocationRecordInput,
): Promise<Location> {
  const userId = await actorUserId(input.actorUid);
  try {
    const location = await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.findUnique({
        where: { id: input.organizationId },
        select: { status: true },
      });
      if (!organization) {
        throw new ServiceError("ORGANIZATION_NOT_FOUND", 404, "Organization not found.");
      }
      if (organization.status !== "ACTIVE") {
        throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
      }

      const created = await transaction.location.create({
        data: {
          id: input.locationId,
          organizationId: input.organizationId,
          name: input.location.name,
          slug: input.location.slug,
          status: input.location.status,
          addressLine1: input.location.address.line1,
          addressLine2: input.location.address.line2,
          postalCode: input.location.address.postalCode,
          city: input.location.city,
          country: input.location.country,
          timezone: input.location.timezone,
        },
      });
      await transaction.auditLog.create({
        data: {
          id: input.auditLogId,
          actorUserId: userId,
          action: "LOCATION_CREATED",
          entityType: "LOCATION",
          entityId: input.locationId,
          organizationId: input.organizationId,
          locationId: input.locationId,
          metadata: { slug: input.location.slug },
        },
      });
      return created;
    });
    return toLocationDomain(location);
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new ServiceError(
        "DUPLICATE_LOCATION_SLUG",
        409,
        "This location slug is already in use for your organization.",
      );
    }
    throw error;
  }
}

export interface CreateHallRecordInput {
  actorUid: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  auditLogId: string;
  hall: ReturnType<typeof createTenantHallSchema.parse>;
}

export async function createHallRecord(input: CreateHallRecordInput): Promise<Hall> {
  const userId = await actorUserId(input.actorUid);
  try {
    const hall = await prisma.$transaction(async (transaction) => {
      const location = await transaction.location.findFirst({
        where: { id: input.locationId, organizationId: input.organizationId },
        include: { organization: { select: { status: true } } },
      });
      if (!location) throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
      if (location.organization.status !== "ACTIVE") {
        throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
      }
      if (location.status !== "ACTIVE") {
        throw new ServiceError("LOCATION_NOT_ACTIVE", 409, "This location must be active before its structure can be changed.");
      }

      const created = await transaction.hall.create({
        data: {
          id: input.hallId,
          locationId: input.locationId,
          name: input.hall.name,
          number: input.hall.number,
          status: input.hall.status,
        },
        include: hallRelations,
      });
      await transaction.auditLog.create({
        data: {
          id: input.auditLogId,
          actorUserId: userId,
          action: "HALL_CREATED",
          entityType: "HALL",
          entityId: input.hallId,
          organizationId: input.organizationId,
          locationId: input.locationId,
          hallId: input.hallId,
          metadata: { number: input.hall.number },
        },
      });
      return created;
    });
    return toHallDomain(hall);
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new ServiceError(
        "DUPLICATE_HALL_NUMBER",
        409,
        "A hall with this number already exists at the location.",
      );
    }
    throw error;
  }
}

export interface SetHallStatusRecordInput {
  actorUid: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  auditLogId: string;
  status: HallStatus;
}

export async function setHallStatusRecord(input: SetHallStatusRecordInput): Promise<Hall> {
  const userId = await actorUserId(input.actorUid);
  const hall = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.hall.findFirst({
      where: {
        id: input.hallId,
        locationId: input.locationId,
        location: { organizationId: input.organizationId },
      },
      include: { location: { include: { organization: true } }, _count: { select: { seats: true } } },
    });
    if (!existing) throw new ServiceError("HALL_NOT_FOUND", 404, "Hall not found.");
    if (existing.location.organization.status !== "ACTIVE") {
      throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
    }
    if (existing.location.status !== "ACTIVE") {
      throw new ServiceError("LOCATION_NOT_ACTIVE", 409, "This location must be active before its structure can be changed.");
    }
    if (existing.status === input.status) {
      throw new ServiceError("NO_STATUS_CHANGE", 409, `Hall is already ${input.status.toLowerCase()}.`);
    }

    const updated = await transaction.hall.update({
      where: { id: input.hallId },
      data: { status: input.status },
      include: hallRelations,
    });
    await transaction.auditLog.create({
      data: {
        id: input.auditLogId,
        actorUserId: userId,
        action: "HALL_STATUS_CHANGED",
        entityType: "HALL",
        entityId: input.hallId,
        organizationId: input.organizationId,
        locationId: input.locationId,
        hallId: input.hallId,
        metadata: { previousStatus: existing.status, status: input.status },
      },
    });
    return updated;
  });
  return toHallDomain(hall);
}

export interface GenerateSeatsRecordInput {
  actorUid: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  auditLogId: string;
  seats: Array<{ row: string; number: number; label: string }>;
}

export async function generateSeatsRecord(input: GenerateSeatsRecordInput): Promise<Seat[]> {
  const userId = await actorUserId(input.actorUid);
  try {
    const created = await prisma.$transaction(async (transaction) => {
      const hall = await transaction.hall.findFirst({
        where: {
          id: input.hallId,
          locationId: input.locationId,
          location: { organizationId: input.organizationId },
        },
        include: { location: { include: { organization: true } } },
      });
      if (!hall) throw new ServiceError("HALL_NOT_FOUND", 404, "Hall not found.");
      if (hall.location.organization.status !== "ACTIVE") {
        throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
      }
      if (hall.location.status !== "ACTIVE") {
        throw new ServiceError("LOCATION_NOT_ACTIVE", 409, "This location must be active before seats can be generated.");
      }
      if (hall.status !== "ACTIVE") {
        throw new ServiceError("HALL_NOT_ACTIVE", 409, "Seats can only be generated for an active hall.");
      }

      const labels = input.seats.map((seat) => seat.label);
      const duplicate = await transaction.seat.findFirst({
        where: { hallId: input.hallId, label: { in: labels } },
        select: { label: true },
      });
      if (duplicate) {
        throw new ServiceError("DUPLICATE_SEAT", 409, `A seat with label ${duplicate.label} already exists.`);
      }

      await transaction.seat.createMany({
        data: input.seats.map((seat) => ({
          ...createSeatSchema.parse({ ...seat, status: "ACTIVE" }),
          id: seatDocumentId(seat.label),
          hallId: input.hallId,
        })),
      });
      await transaction.auditLog.create({
        data: {
          id: input.auditLogId,
          actorUserId: userId,
          action: "SEATS_GENERATED",
          entityType: "HALL",
          entityId: input.hallId,
          organizationId: input.organizationId,
          locationId: input.locationId,
          hallId: input.hallId,
          metadata: {
            count: input.seats.length,
            firstLabel: input.seats[0]?.label ?? null,
            lastLabel: input.seats.at(-1)?.label ?? null,
          },
        },
      });
      return transaction.seat.findMany({
        where: { hallId: input.hallId, label: { in: labels } },
        include: seatRelations,
      });
    }, { isolationLevel: "Serializable" });
    return created.map(toSeatDomain);
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new ServiceError("DUPLICATE_SEAT", 409, "One or more generated seat labels already exist.");
    }
    throw error;
  }
}

export interface SetSeatStatusRecordInput {
  actorUid: string;
  organizationId: string;
  locationId: string;
  hallId: string;
  seatId: string;
  auditLogId: string;
  status: SeatStatus;
}

export async function setSeatStatusRecord(input: SetSeatStatusRecordInput): Promise<Seat> {
  const userId = await actorUserId(input.actorUid);
  const seat = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.seat.findUnique({
      where: { hallId_id: { hallId: input.hallId, id: input.seatId } },
      include: { hall: { include: { location: { include: { organization: true } } } } },
    });
    if (
      !existing ||
      existing.hall.locationId !== input.locationId ||
      existing.hall.location.organizationId !== input.organizationId
    ) {
      throw new ServiceError("SEAT_NOT_FOUND", 404, "Seat not found.");
    }
    if (existing.hall.location.organization.status !== "ACTIVE") {
      throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
    }
    if (existing.hall.location.status !== "ACTIVE") {
      throw new ServiceError("LOCATION_NOT_ACTIVE", 409, "The location must be active before seats can be changed.");
    }
    if (existing.hall.status !== "ACTIVE") {
      throw new ServiceError("HALL_NOT_ACTIVE", 409, "The hall must be active before seats can be changed.");
    }
    if (existing.status === input.status) {
      throw new ServiceError("NO_STATUS_CHANGE", 409, `Seat is already ${input.status.toLowerCase()}.`);
    }

    const updated = await transaction.seat.update({
      where: { hallId_id: { hallId: input.hallId, id: input.seatId } },
      data: { status: input.status },
      include: seatRelations,
    });
    await transaction.auditLog.create({
      data: {
        id: input.auditLogId,
        actorUserId: userId,
        action: input.status === "ACTIVE" ? "SEAT_ENABLED" : "SEAT_DISABLED",
        entityType: "SEAT",
        entityId: input.seatId,
        organizationId: input.organizationId,
        locationId: input.locationId,
        hallId: input.hallId,
        metadata: { label: existing.label },
      },
    });
    return updated;
  });
  return toSeatDomain(seat);
}
