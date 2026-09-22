import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { seatDocumentId, seatRowOrdinal } from "@/lib/tenant-admin/seats";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  mapHallDocument,
  mapLocationDocument,
  mapSeatDocument,
} from "@/server/firestore/mappers";
import {
  auditLogDocumentPath,
  hallDocumentPath,
  hallsCollectionPath,
  locationDocumentPath,
  locationSlugDocumentPath,
  locationsCollectionPath,
  organizationDocumentPath,
  seatDocumentPath,
  seatsCollectionPath,
} from "@/server/firestore/paths";
import { ServiceError } from "@/server/services/service-error";
import type { Hall } from "@/types/hall";
import type { Location } from "@/types/location";
import type { Seat } from "@/types/seat";
import type { HallStatus, SeatStatus } from "@/types/status";
import { hallDocumentSchema, createTenantHallSchema } from "@/validation/hall";
import { createLocationSchema, locationDocumentSchema } from "@/validation/location";
import { organizationDocumentSchema } from "@/validation/organization";
import { createSeatSchema, seatDocumentSchema } from "@/validation/seat";

function firestore() {
  return getAdminFirestore();
}

function requireActiveOrganization(data: unknown) {
  const organization = organizationDocumentSchema.parse(data);
  if (organization.status !== "ACTIVE") {
    throw new ServiceError(
      "ORGANIZATION_NOT_ACTIVE",
      403,
      "This organization is not active.",
    );
  }
  return organization;
}

function requireActiveLocation(data: unknown) {
  const location = locationDocumentSchema.parse(data);
  if (location.status !== "ACTIVE") {
    throw new ServiceError(
      "LOCATION_NOT_ACTIVE",
      409,
      "This location must be active before its structure can be changed.",
    );
  }
  return location;
}

export async function listTenantLocations(
  organizationId: string,
  permittedLocationIds: readonly string[] | null,
): Promise<Location[]> {
  const database = firestore();

  if (permittedLocationIds !== null) {
    if (permittedLocationIds.length === 0) return [];
    const references = permittedLocationIds.map((locationId) =>
      database.doc(locationDocumentPath(organizationId, locationId)),
    );
    const snapshots = await database.getAll(...references);

    return snapshots
      .map((snapshot) => mapLocationDocument(organizationId, snapshot))
      .filter((location): location is Location => location !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  const snapshot = await database
    .collection(locationsCollectionPath(organizationId))
    .orderBy("name", "asc")
    .get();

  return snapshot.docs.map((document) => {
    const location = mapLocationDocument(organizationId, document);
    if (!location) throw new Error("A location could not be mapped.");
    return location;
  });
}

export async function getTenantLocation(
  organizationId: string,
  locationId: string,
): Promise<Location | null> {
  return mapLocationDocument(
    organizationId,
    await firestore().doc(locationDocumentPath(organizationId, locationId)).get(),
  );
}

export async function listLocationHalls(
  organizationId: string,
  locationId: string,
): Promise<Hall[]> {
  const snapshot = await firestore()
    .collection(hallsCollectionPath(organizationId, locationId))
    .orderBy("number", "asc")
    .get();

  return snapshot.docs.map((document) => {
    const hall = mapHallDocument(organizationId, locationId, document);
    if (!hall) throw new Error("A hall could not be mapped.");
    return hall;
  });
}

export async function getLocationHall(
  organizationId: string,
  locationId: string,
  hallId: string,
): Promise<Hall | null> {
  return mapHallDocument(
    organizationId,
    locationId,
    await firestore().doc(hallDocumentPath(organizationId, locationId, hallId)).get(),
  );
}

export async function listHallSeats(
  organizationId: string,
  locationId: string,
  hallId: string,
): Promise<Seat[]> {
  const snapshot = await firestore()
    .collection(seatsCollectionPath(organizationId, locationId, hallId))
    .orderBy("label", "asc")
    .get();

  return snapshot.docs
    .map((document) => mapSeatDocument(organizationId, locationId, hallId, document))
    .filter((seat): seat is Seat => seat !== null)
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
  const database = firestore();
  const organizationReference = database.doc(organizationDocumentPath(input.organizationId));
  const locationReference = database.doc(locationDocumentPath(input.organizationId, input.locationId));
  const slugReference = database.doc(locationSlugDocumentPath(input.organizationId, input.location.slug));
  const auditReference = database.doc(auditLogDocumentPath(input.auditLogId));

  await database.runTransaction(async (transaction) => {
    const [organizationSnapshot, slugSnapshot] = await Promise.all([
      transaction.get(organizationReference),
      transaction.get(slugReference),
    ]);

    if (!organizationSnapshot.exists) {
      throw new ServiceError("ORGANIZATION_NOT_FOUND", 404, "Organization not found.");
    }
    requireActiveOrganization(organizationSnapshot.data());
    if (slugSnapshot.exists) {
      throw new ServiceError(
        "DUPLICATE_LOCATION_SLUG",
        409,
        "This location slug is already in use for your organization.",
      );
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.create(locationReference, {
      ...input.location,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.create(slugReference, {
      locationId: input.locationId,
      createdAt: timestamp,
    });
    transaction.create(auditReference, {
      actorUid: input.actorUid,
      action: "LOCATION_CREATED",
      entityType: "LOCATION",
      entityId: input.locationId,
      organizationId: input.organizationId,
      metadata: { slug: input.location.slug },
      createdAt: timestamp,
    });
  });

  const location = mapLocationDocument(input.organizationId, await locationReference.get());
  if (!location) throw new Error("Location was created but could not be read back.");
  return location;
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
  const database = firestore();
  const organizationReference = database.doc(organizationDocumentPath(input.organizationId));
  const locationReference = database.doc(locationDocumentPath(input.organizationId, input.locationId));
  const hallReference = database.doc(hallDocumentPath(input.organizationId, input.locationId, input.hallId));
  const duplicateNumberQuery = database
    .collection(hallsCollectionPath(input.organizationId, input.locationId))
    .where("number", "==", input.hall.number)
    .limit(1);
  const auditReference = database.doc(auditLogDocumentPath(input.auditLogId));

  await database.runTransaction(async (transaction) => {
    const [organizationSnapshot, locationSnapshot, duplicateSnapshot] = await Promise.all([
      transaction.get(organizationReference),
      transaction.get(locationReference),
      transaction.get(duplicateNumberQuery),
    ]);

    if (!organizationSnapshot.exists || !locationSnapshot.exists) {
      throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
    }
    requireActiveOrganization(organizationSnapshot.data());
    requireActiveLocation(locationSnapshot.data());
    if (!duplicateSnapshot.empty) {
      throw new ServiceError(
        "DUPLICATE_HALL_NUMBER",
        409,
        "A hall with this number already exists at the location.",
      );
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.create(hallReference, {
      ...input.hall,
      seatCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.create(auditReference, {
      actorUid: input.actorUid,
      action: "HALL_CREATED",
      entityType: "HALL",
      entityId: input.hallId,
      organizationId: input.organizationId,
      metadata: { locationId: input.locationId, number: input.hall.number },
      createdAt: timestamp,
    });
  });

  const hall = mapHallDocument(input.organizationId, input.locationId, await hallReference.get());
  if (!hall) throw new Error("Hall was created but could not be read back.");
  return hall;
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
  const database = firestore();
  const organizationReference = database.doc(organizationDocumentPath(input.organizationId));
  const locationReference = database.doc(locationDocumentPath(input.organizationId, input.locationId));
  const hallReference = database.doc(hallDocumentPath(input.organizationId, input.locationId, input.hallId));
  const auditReference = database.doc(auditLogDocumentPath(input.auditLogId));

  await database.runTransaction(async (transaction) => {
    const [organizationSnapshot, locationSnapshot, hallSnapshot] = await Promise.all([
      transaction.get(organizationReference),
      transaction.get(locationReference),
      transaction.get(hallReference),
    ]);
    if (!organizationSnapshot.exists || !locationSnapshot.exists || !hallSnapshot.exists) {
      throw new ServiceError("HALL_NOT_FOUND", 404, "Hall not found.");
    }
    requireActiveOrganization(organizationSnapshot.data());
    requireActiveLocation(locationSnapshot.data());
    const hall = hallDocumentSchema.parse(hallSnapshot.data());
    if (hall.status === input.status) {
      throw new ServiceError("NO_STATUS_CHANGE", 409, `Hall is already ${input.status.toLowerCase()}.`);
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.update(hallReference, { status: input.status, updatedAt: timestamp });
    transaction.create(auditReference, {
      actorUid: input.actorUid,
      action: "HALL_STATUS_CHANGED",
      entityType: "HALL",
      entityId: input.hallId,
      organizationId: input.organizationId,
      metadata: {
        locationId: input.locationId,
        previousStatus: hall.status,
        status: input.status,
      },
      createdAt: timestamp,
    });
  });

  const hall = mapHallDocument(input.organizationId, input.locationId, await hallReference.get());
  if (!hall) throw new Error("Hall was updated but could not be read back.");
  return hall;
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
  const database = firestore();
  const organizationReference = database.doc(organizationDocumentPath(input.organizationId));
  const locationReference = database.doc(locationDocumentPath(input.organizationId, input.locationId));
  const hallReference = database.doc(hallDocumentPath(input.organizationId, input.locationId, input.hallId));
  const auditReference = database.doc(auditLogDocumentPath(input.auditLogId));
  const seatReferences = input.seats.map((seat) =>
    database.doc(seatDocumentPath(input.organizationId, input.locationId, input.hallId, seatDocumentId(seat.label))),
  );

  const [organizationSnapshot, locationSnapshot, hallSnapshot, ...seatSnapshots] =
    await database.getAll(organizationReference, locationReference, hallReference, ...seatReferences);

  if (!organizationSnapshot.exists || !locationSnapshot.exists || !hallSnapshot.exists) {
    throw new ServiceError("HALL_NOT_FOUND", 404, "Hall not found.");
  }
  requireActiveOrganization(organizationSnapshot.data());
  requireActiveLocation(locationSnapshot.data());
  const hall = hallDocumentSchema.parse(hallSnapshot.data());
  if (hall.status !== "ACTIVE") {
    throw new ServiceError("HALL_NOT_ACTIVE", 409, "Seats can only be generated for an active hall.");
  }

  const conflictIndex = seatSnapshots.findIndex((snapshot) => snapshot.exists);
  if (conflictIndex >= 0) {
    throw new ServiceError(
      "DUPLICATE_SEAT",
      409,
      `A seat with label ${input.seats[conflictIndex].label} already exists.`,
    );
  }

  const timestamp = FieldValue.serverTimestamp();
  const batch = database.batch();
  input.seats.forEach((seat, index) => {
    batch.create(seatReferences[index], {
      ...createSeatSchema.parse({ ...seat, status: "ACTIVE" }),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
  batch.update(hallReference, {
    seatCount: FieldValue.increment(input.seats.length),
    updatedAt: timestamp,
  });
  batch.create(auditReference, {
    actorUid: input.actorUid,
    action: "SEATS_GENERATED",
    entityType: "HALL",
    entityId: input.hallId,
    organizationId: input.organizationId,
    metadata: {
      locationId: input.locationId,
      count: input.seats.length,
      firstLabel: input.seats[0]?.label ?? null,
      lastLabel: input.seats.at(-1)?.label ?? null,
    },
    createdAt: timestamp,
  });

  try {
    await batch.commit();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "6" || code.toLowerCase().includes("already")) {
      throw new ServiceError("DUPLICATE_SEAT", 409, "One or more generated seat labels already exist.");
    }
    throw error;
  }

  const createdSnapshots = await database.getAll(...seatReferences);
  return createdSnapshots
    .map((snapshot) => mapSeatDocument(input.organizationId, input.locationId, input.hallId, snapshot))
    .filter((seat): seat is Seat => seat !== null);
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
  const database = firestore();
  const organizationReference = database.doc(organizationDocumentPath(input.organizationId));
  const locationReference = database.doc(locationDocumentPath(input.organizationId, input.locationId));
  const hallReference = database.doc(hallDocumentPath(input.organizationId, input.locationId, input.hallId));
  const seatReference = database.doc(seatDocumentPath(input.organizationId, input.locationId, input.hallId, input.seatId));
  const auditReference = database.doc(auditLogDocumentPath(input.auditLogId));

  await database.runTransaction(async (transaction) => {
    const [organizationSnapshot, locationSnapshot, hallSnapshot, seatSnapshot] = await Promise.all([
      transaction.get(organizationReference),
      transaction.get(locationReference),
      transaction.get(hallReference),
      transaction.get(seatReference),
    ]);
    if (!organizationSnapshot.exists || !locationSnapshot.exists || !hallSnapshot.exists || !seatSnapshot.exists) {
      throw new ServiceError("SEAT_NOT_FOUND", 404, "Seat not found.");
    }
    requireActiveOrganization(organizationSnapshot.data());
    requireActiveLocation(locationSnapshot.data());
    const hall = hallDocumentSchema.parse(hallSnapshot.data());
    if (hall.status !== "ACTIVE") {
      throw new ServiceError("HALL_NOT_ACTIVE", 409, "The hall must be active before seats can be changed.");
    }
    const seat = seatDocumentSchema.parse(seatSnapshot.data());
    if (seat.status === input.status) {
      throw new ServiceError("NO_STATUS_CHANGE", 409, `Seat is already ${input.status.toLowerCase()}.`);
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.update(seatReference, { status: input.status, updatedAt: timestamp });
    transaction.create(auditReference, {
      actorUid: input.actorUid,
      action: input.status === "ACTIVE" ? "SEAT_ENABLED" : "SEAT_DISABLED",
      entityType: "SEAT",
      entityId: input.seatId,
      organizationId: input.organizationId,
      metadata: {
        locationId: input.locationId,
        hallId: input.hallId,
        label: seat.label,
      },
      createdAt: timestamp,
    });
  });

  const seat = mapSeatDocument(input.organizationId, input.locationId, input.hallId, await seatReference.get());
  if (!seat) throw new Error("Seat was updated but could not be read back.");
  return seat;
}
