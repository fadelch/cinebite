import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";
import type { OrganizationDetail } from "@/types/super-admin";

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  status: Organization["status"];
  createdAt: string;
  updatedAt: string;
}

export interface LocationDto {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: Location["status"];
  address: Location["address"];
  city: string;
  country: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationDetailDto {
  organization: OrganizationDto;
  locations: LocationDto[];
  administrators: OrganizationDetail["administrators"];
}

export function toOrganizationDto(
  organization: Organization,
): OrganizationDto {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    createdAt: organization.createdAt.toDate().toISOString(),
    updatedAt: organization.updatedAt.toDate().toISOString(),
  };
}

export function toLocationDto(location: Location): LocationDto {
  return {
    id: location.id,
    organizationId: location.organizationId,
    name: location.name,
    slug: location.slug,
    status: location.status,
    address: location.address,
    city: location.city,
    country: location.country,
    timezone: location.timezone,
    createdAt: location.createdAt.toDate().toISOString(),
    updatedAt: location.updatedAt.toDate().toISOString(),
  };
}

export function toOrganizationDetailDto(
  detail: OrganizationDetail,
): OrganizationDetailDto {
  return {
    organization: toOrganizationDto(detail.organization),
    locations: detail.locations.map(toLocationDto),
    administrators: detail.administrators,
  };
}
