import "server-only";

import { documentIdSchema } from "@/validation/shared";

function validId(value: string): string {
  return documentIdSchema.parse(value);
}

export function organizationDocumentPath(organizationId: string): string {
  return `organizations/${validId(organizationId)}`;
}

export function locationsCollectionPath(organizationId: string): string {
  return `${organizationDocumentPath(organizationId)}/locations`;
}

export function locationDocumentPath(
  organizationId: string,
  locationId: string,
): string {
  return `${locationsCollectionPath(organizationId)}/${validId(locationId)}`;
}

export function hallsCollectionPath(
  organizationId: string,
  locationId: string,
): string {
  return `${locationDocumentPath(organizationId, locationId)}/halls`;
}

export function hallDocumentPath(
  organizationId: string,
  locationId: string,
  hallId: string,
): string {
  return `${hallsCollectionPath(organizationId, locationId)}/${validId(hallId)}`;
}

export function seatsCollectionPath(
  organizationId: string,
  locationId: string,
  hallId: string,
): string {
  return `${hallDocumentPath(organizationId, locationId, hallId)}/seats`;
}

export function seatDocumentPath(
  organizationId: string,
  locationId: string,
  hallId: string,
  seatId: string,
): string {
  return `${seatsCollectionPath(organizationId, locationId, hallId)}/${validId(seatId)}`;
}
