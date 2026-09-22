import "server-only";

import { prisma } from "@/lib/db/prisma";
import { toLocationDomain } from "@/server/database/mappers";
import type { Location } from "@/types/location";
import {
  createLocationSchema,
  type CreateLocationInput,
} from "@/validation/location";
import { documentIdSchema } from "@/validation/shared";

export async function createLocation(
  organizationIdInput: string,
  input: CreateLocationInput,
): Promise<Location> {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const data = createLocationSchema.parse(input);
  return toLocationDomain(
    await prisma.location.create({
      data: {
        organizationId,
        name: data.name,
        slug: data.slug,
        status: data.status,
        addressLine1: data.address.line1,
        addressLine2: data.address.line2,
        postalCode: data.address.postalCode,
        city: data.city,
        country: data.country,
        timezone: data.timezone,
      },
    }),
  );
}

export async function getLocationById(
  organizationIdInput: string,
  locationIdInput: string,
): Promise<Location | null> {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const id = documentIdSchema.parse(locationIdInput);
  const location = await prisma.location.findFirst({
    where: { id, organizationId },
  });
  return location ? toLocationDomain(location) : null;
}

export async function listLocationsForOrganization(
  organizationIdInput: string,
): Promise<Location[]> {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const locations = await prisma.location.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  return locations.map(toLocationDomain);
}
