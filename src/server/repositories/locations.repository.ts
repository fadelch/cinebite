import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase/admin";
import { mapLocationDocument } from "@/server/firestore/mappers";
import {
  locationDocumentPath,
  locationsCollectionPath,
} from "@/server/firestore/paths";
import { getOrganizationById } from "@/server/repositories/organizations.repository";
import type { Location } from "@/types/location";
import {
  createLocationSchema,
  type CreateLocationInput,
} from "@/validation/location";

async function assertOrganizationExists(
  organizationId: string,
): Promise<void> {
  const organization = await getOrganizationById(organizationId);

  if (!organization) {
    throw new Error(`Organization "${organizationId}" does not exist.`);
  }
}

async function assertLocationSlugAvailable(
  organizationId: string,
  slug: string,
): Promise<void> {
  const snapshot = await adminFirestore
    .collection(locationsCollectionPath(organizationId))
    .where("slug", "==", slug)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    throw new Error(
      `Location slug "${slug}" is already in use for this organization.`,
    );
  }
}

export async function createLocation(
  organizationId: string,
  input: CreateLocationInput,
): Promise<Location> {
  const data = createLocationSchema.parse(input);
  await assertOrganizationExists(organizationId);
  await assertLocationSlugAvailable(organizationId, data.slug);

  const reference = adminFirestore
    .collection(locationsCollectionPath(organizationId))
    .doc();
  const timestamp = FieldValue.serverTimestamp();

  await reference.set({
    ...data,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const location = mapLocationDocument(
    organizationId,
    await reference.get(),
  );

  if (!location) {
    throw new Error("Location was created but could not be read back.");
  }

  return location;
}

export async function getLocationById(
  organizationId: string,
  locationId: string,
): Promise<Location | null> {
  const snapshot = await adminFirestore
    .doc(locationDocumentPath(organizationId, locationId))
    .get();

  return mapLocationDocument(organizationId, snapshot);
}

export async function listLocationsForOrganization(
  organizationId: string,
): Promise<Location[]> {
  await assertOrganizationExists(organizationId);

  const snapshot = await adminFirestore
    .collection(locationsCollectionPath(organizationId))
    .orderBy("name", "asc")
    .get();

  return snapshot.docs.map((document) => {
    const location = mapLocationDocument(organizationId, document);

    if (!location) {
      throw new Error(`Location "${document.id}" could not be mapped.`);
    }

    return location;
  });
}
