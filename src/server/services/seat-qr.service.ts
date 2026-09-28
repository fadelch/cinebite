import "server-only";

import { getCurrentUser } from "@/server/auth/current-user";
import { deleteSeatQrImage, createSeatQrPng, readSeatQrImage, seatQrImagePath, storeSeatQrImage } from "@/server/media/seat-qr-image";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import {
  createSeatQrRecord,
  getSeatQrHallRecord,
  getSeatQrImageRecord,
  getSeatQrTargetRecord,
  replaceSeatQrRecord,
  revokeSeatQrRecord,
} from "@/server/repositories/seat-qr.repository";
import { assertSeatQrLocationAccess, requireSeatQrActor } from "@/server/services/seat-qr-access";
import { ServiceError } from "@/server/services/service-error";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/security/opaque-token";
import { seatRowOrdinal } from "@/lib/tenant-admin/seats";
import type { SeatQrHallDto } from "@/types/seat-qr";
import { documentIdSchema } from "@/validation/shared";

async function adminContext(locationIdInput: string) {
  const actor = requireSeatQrActor(await getCurrentUser());
  const locationId = documentIdSchema.parse(locationIdInput);
  assertSeatQrLocationAccess(actor, locationId);
  const organization = await getOrganizationById(actor.organizationId);
  if (!organization || organization.status !== "ACTIVE") {
    throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 403, "This organization is not active.");
  }
  return { actor, organization, locationId };
}

function hallDto(hall: NonNullable<Awaited<ReturnType<typeof getSeatQrHallRecord>>>): SeatQrHallDto {
  return {
    organizationName: hall.location.organization.name,
    locationId: hall.location.id,
    locationName: hall.location.name,
    locationStatus: hall.location.status,
    hallId: hall.id,
    hallName: hall.name,
    hallNumber: hall.number,
    hallStatus: hall.status,
    seats: hall.seats
      .map((seat): SeatQrHallDto["seats"][number] => ({
        id: seat.id,
        label: seat.label,
        row: seat.row,
        number: seat.number,
        seatStatus: seat.status,
        qrStatus: seat.qrCode?.status ?? "MISSING",
        version: seat.qrCode?.version ?? null,
        imageAvailable: Boolean(seat.qrCode?.qrImageStoragePath || seat.qrCode?.qrImageData),
        createdAt: seat.qrCode?.createdAt.toISOString() ?? null,
        rotatedAt: seat.qrCode?.rotatedAt?.toISOString() ?? null,
        revokedAt: seat.qrCode?.revokedAt?.toISOString() ?? null,
      }))
      .sort((left, right) => left.row === right.row ? left.number - right.number : seatRowOrdinal(left.row) - seatRowOrdinal(right.row)),
  };
}

async function requireHall(organizationId: string, locationId: string, hallIdInput: string) {
  const hallId = documentIdSchema.parse(hallIdInput);
  const hall = await getSeatQrHallRecord(organizationId, locationId, hallId);
  if (!hall) throw new ServiceError("HALL_NOT_FOUND", 404, "Hall not found.");
  return hall;
}

function assertOperational(target: NonNullable<Awaited<ReturnType<typeof getSeatQrTargetRecord>>>) {
  if (target.hall.location.organization.status !== "ACTIVE") throw new ServiceError("ORGANIZATION_NOT_ACTIVE", 409, "The organization is not active.");
  if (target.hall.location.status !== "ACTIVE") throw new ServiceError("LOCATION_NOT_ACTIVE", 409, "The location is not active.");
  if (target.hall.status !== "ACTIVE") throw new ServiceError("HALL_NOT_ACTIVE", 409, "The hall is not active.");
  if (target.status !== "ACTIVE") throw new ServiceError("SEAT_NOT_FOUND", 409, "The seat must be active before issuing a QR credential.");
}

async function prepareImage(input: { organizationId: string; locationId: string; hallId: string; seatId: string; version: number }) {
  const credential = createOpaqueToken();
  const tokenHash = hashOpaqueToken(credential);
  const storagePath = seatQrImagePath(input);
  const image = await createSeatQrPng(credential);
  try {
    await storeSeatQrImage(storagePath, image);
    return { tokenHash, storagePath, imageData: null };
  } catch (error) {
    console.warn("[seat-qr/media] Firebase Storage unavailable; using protected PostgreSQL image storage.", { name: error instanceof Error ? error.name : "UnknownError" });
    return { tokenHash, storagePath: null, imageData: Uint8Array.from(image) };
  }
}

export async function getSeatQrHall(locationIdInput: string, hallIdInput: string) {
  const { actor, locationId } = await adminContext(locationIdInput);
  return hallDto(await requireHall(actor.organizationId, locationId, hallIdInput));
}

export async function generateMissingSeatQrs(locationIdInput: string, hallIdInput: string) {
  const { actor, locationId } = await adminContext(locationIdInput);
  const hall = await requireHall(actor.organizationId, locationId, hallIdInput);
  if (hall.location.status !== "ACTIVE") throw new ServiceError("LOCATION_NOT_ACTIVE", 409, "The location is not active.");
  if (hall.status !== "ACTIVE") throw new ServiceError("HALL_NOT_ACTIVE", 409, "The hall is not active.");
  const missing = hall.seats.filter((seat) => seat.status === "ACTIVE" && !seat.qrCode);
  let generated = 0;
  for (const seat of missing) {
    const prepared = await prepareImage({ organizationId: actor.organizationId, locationId, hallId: hall.id, seatId: seat.id, version: 1 });
    try {
      await createSeatQrRecord({ actorUid: actor.uid, organizationId: actor.organizationId, locationId, hallId: hall.id, seatId: seat.id, seatLabel: seat.label, ...prepared });
      generated += 1;
    } catch (error) {
      if (prepared.storagePath) await deleteSeatQrImage(prepared.storagePath).catch(() => undefined);
      if (!(error instanceof ServiceError && error.code === "SEAT_QR_ALREADY_EXISTS")) throw error;
    }
  }
  return { generated, skipped: hall.seats.length - generated, hall: await getSeatQrHall(locationId, hall.id) };
}

async function replaceSeatQr(locationIdInput: string, hallIdInput: string, seatIdInput: string, action: "SEAT_QR_ROTATED" | "SEAT_QR_GENERATED") {
  const { actor, locationId } = await adminContext(locationIdInput);
  const hallId = documentIdSchema.parse(hallIdInput);
  const seatId = documentIdSchema.parse(seatIdInput);
  const target = await getSeatQrTargetRecord(actor.organizationId, locationId, hallId, seatId);
  if (!target) throw new ServiceError("SEAT_NOT_FOUND", 404, "Seat not found.");
  assertOperational(target);
  if (!target.qrCode) {
    const prepared = await prepareImage({ organizationId: actor.organizationId, locationId, hallId, seatId, version: 1 });
    try {
      return await createSeatQrRecord({ actorUid: actor.uid, organizationId: actor.organizationId, locationId, hallId, seatId, seatLabel: target.label, ...prepared });
    } catch (error) {
      if (prepared.storagePath) await deleteSeatQrImage(prepared.storagePath).catch(() => undefined);
      throw error;
    }
  }
  const previousPath = target.qrCode.qrImageStoragePath;
  const nextVersion = target.qrCode.version + 1;
  const prepared = await prepareImage({ organizationId: actor.organizationId, locationId, hallId, seatId, version: nextVersion });
  try {
    const updated = await replaceSeatQrRecord({
      actorUid: actor.uid,
      organizationId: actor.organizationId,
      locationId,
      hallId,
      seatId,
      seatLabel: target.label,
      expectedVersion: target.qrCode.version,
      action,
      ...prepared,
    });
    if (previousPath && previousPath !== prepared.storagePath) await deleteSeatQrImage(previousPath).catch(() => undefined);
    return updated;
  } catch (error) {
    if (prepared.storagePath) await deleteSeatQrImage(prepared.storagePath).catch(() => undefined);
    throw error;
  }
}

export function rotateSeatQr(locationId: string, hallId: string, seatId: string) {
  return replaceSeatQr(locationId, hallId, seatId, "SEAT_QR_ROTATED");
}

export function regenerateSeatQr(locationId: string, hallId: string, seatId: string) {
  return replaceSeatQr(locationId, hallId, seatId, "SEAT_QR_GENERATED");
}

export async function revokeSeatQr(locationIdInput: string, hallIdInput: string, seatIdInput: string) {
  const { actor, locationId } = await adminContext(locationIdInput);
  const hallId = documentIdSchema.parse(hallIdInput);
  const seatId = documentIdSchema.parse(seatIdInput);
  const target = await getSeatQrTargetRecord(actor.organizationId, locationId, hallId, seatId);
  if (!target) throw new ServiceError("SEAT_NOT_FOUND", 404, "Seat not found.");
  return revokeSeatQrRecord({ actorUid: actor.uid, organizationId: actor.organizationId, locationId, hallId, seatId, seatLabel: target.label });
}

export async function getSeatQrImage(locationIdInput: string, hallIdInput: string, seatIdInput: string) {
  const { actor, locationId } = await adminContext(locationIdInput);
  const hallId = documentIdSchema.parse(hallIdInput);
  const seatId = documentIdSchema.parse(seatIdInput);
  const record = await getSeatQrImageRecord(actor.organizationId, locationId, hallId, seatId);
  if (record?.qrImageData) return Buffer.from(record.qrImageData);
  if (record?.qrImageStoragePath) return readSeatQrImage(record.qrImageStoragePath);
  throw new ServiceError("SEAT_QR_NOT_FOUND", 404, "Seat QR image not found.");
}
