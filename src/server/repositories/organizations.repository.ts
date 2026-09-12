import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase/admin";
import { mapOrganizationDocument } from "@/server/firestore/mappers";
import { organizationDocumentPath } from "@/server/firestore/paths";
import type { Organization } from "@/types/organization";
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  updateOrganizationSchema,
} from "@/validation/organization";
import { slugSchema } from "@/validation/shared";

const organizations = adminFirestore.collection("organizations");

async function assertSlugAvailable(
  slug: string,
  excludedOrganizationId?: string,
): Promise<void> {
  const snapshot = await organizations.where("slug", "==", slug).limit(2).get();
  const conflict = snapshot.docs.some(
    (document) => document.id !== excludedOrganizationId,
  );

  if (conflict) {
    throw new Error(`Organization slug "${slug}" is already in use.`);
  }
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<Organization> {
  const data = createOrganizationSchema.parse(input);
  await assertSlugAvailable(data.slug);

  const reference = organizations.doc();
  const timestamp = FieldValue.serverTimestamp();

  await reference.set({
    ...data,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const organization = mapOrganizationDocument(await reference.get());

  if (!organization) {
    throw new Error("Organization was created but could not be read back.");
  }

  return organization;
}

export async function getOrganizationById(
  organizationId: string,
): Promise<Organization | null> {
  const snapshot = await adminFirestore
    .doc(organizationDocumentPath(organizationId))
    .get();

  return mapOrganizationDocument(snapshot);
}

export async function getOrganizationBySlug(
  rawSlug: string,
): Promise<Organization | null> {
  const slug = slugSchema.parse(rawSlug);
  const snapshot = await organizations
    .where("slug", "==", slug)
    .limit(1)
    .get();

  const [document] = snapshot.docs;
  return document ? mapOrganizationDocument(document) : null;
}

export async function updateOrganization(
  organizationId: string,
  input: UpdateOrganizationInput,
): Promise<Organization> {
  const reference = adminFirestore.doc(
    organizationDocumentPath(organizationId),
  );
  const data = updateOrganizationSchema.parse(input);

  if (data.slug) {
    await assertSlugAvailable(data.slug, reference.id);
  }

  await reference.update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const organization = mapOrganizationDocument(await reference.get());

  if (!organization) {
    throw new Error(`Organization "${organizationId}" does not exist.`);
  }

  return organization;
}
