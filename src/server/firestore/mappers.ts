import "server-only";

import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";
import { locationDocumentSchema } from "@/validation/location";
import { organizationDocumentSchema } from "@/validation/organization";

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
