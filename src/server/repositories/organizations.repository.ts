import "server-only";

import { prisma } from "@/lib/db/prisma";
import { toOrganizationDomain } from "@/server/database/mappers";
import type { Organization } from "@/types/organization";
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  updateOrganizationSchema,
} from "@/validation/organization";
import { documentIdSchema, slugSchema } from "@/validation/shared";

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<Organization> {
  const data = createOrganizationSchema.parse(input);
  return toOrganizationDomain(await prisma.organization.create({ data }));
}

export async function getOrganizationById(
  organizationId: string,
): Promise<Organization | null> {
  const id = documentIdSchema.parse(organizationId);
  const organization = await prisma.organization.findUnique({ where: { id } });
  return organization ? toOrganizationDomain(organization) : null;
}

export async function getOrganizationBySlug(
  rawSlug: string,
): Promise<Organization | null> {
  const slug = slugSchema.parse(rawSlug);
  const organization = await prisma.organization.findUnique({ where: { slug } });
  return organization ? toOrganizationDomain(organization) : null;
}

export async function updateOrganization(
  organizationId: string,
  input: UpdateOrganizationInput,
): Promise<Organization> {
  const id = documentIdSchema.parse(organizationId);
  const data = updateOrganizationSchema.parse(input);
  return toOrganizationDomain(
    await prisma.organization.update({ where: { id }, data }),
  );
}
