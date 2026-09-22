import "server-only";

import type { Hall } from "@/types/hall";
import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";
import type { Seat } from "@/types/seat";
import { hallDocumentSchema } from "@/validation/hall";
import { locationDocumentSchema } from "@/validation/location";
import { organizationDocumentSchema } from "@/validation/organization";
import { seatDocumentSchema } from "@/validation/seat";

interface FirestoreDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  data(): unknown;
}

export function mapOrganizationDocument(
  snapshot: FirestoreDocumentSnapshot,
): Organization | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = organizationDocumentSchema.parse(snapshot.data());

  return {
    id: snapshot.id,
    ...data,
  };
}

export function mapLocationDocument(
  organizationId: string,
  snapshot: FirestoreDocumentSnapshot,
): Location | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = locationDocumentSchema.parse(snapshot.data());

  return {
    id: snapshot.id,
    organizationId,
    ...data,
  };
}

export function mapHallDocument(
  organizationId: string,
  locationId: string,
  snapshot: FirestoreDocumentSnapshot,
): Hall | null {
  if (!snapshot.exists) return null;

  return {
    id: snapshot.id,
    organizationId,
    locationId,
    ...hallDocumentSchema.parse(snapshot.data()),
  };
}

export function mapSeatDocument(
  organizationId: string,
  locationId: string,
  hallId: string,
  snapshot: FirestoreDocumentSnapshot,
): Seat | null {
  if (!snapshot.exists) return null;

  return {
    id: snapshot.id,
    organizationId,
    locationId,
    hallId,
    ...seatDocumentSchema.parse(snapshot.data()),
  };
}
