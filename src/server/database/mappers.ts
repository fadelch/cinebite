import "server-only";

import type { DatabaseTimestamp } from "@/types/database";
import type { Hall } from "@/types/hall";
import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";
import type { Seat } from "@/types/seat";

export function toDatabaseTimestamp(date: Date): DatabaseTimestamp {
  const milliseconds = date.getTime();
  return {
    seconds: Math.floor(milliseconds / 1_000),
    nanoseconds: (milliseconds % 1_000) * 1_000_000,
    toDate: () => new Date(milliseconds),
  };
}

export function toOrganizationDomain(row: {
  id: string;
  name: string;
  slug: string;
  status: Organization["status"];
  createdAt: Date;
  updatedAt: Date;
}): Organization {
  return {
    ...row,
    createdAt: toDatabaseTimestamp(row.createdAt),
    updatedAt: toDatabaseTimestamp(row.updatedAt),
  };
}

export function toLocationDomain(row: {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: Location["status"];
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
  city: string;
  country: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}): Location {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    status: row.status,
    address: {
      line1: row.addressLine1,
      ...(row.addressLine2 ? { line2: row.addressLine2 } : {}),
      ...(row.postalCode ? { postalCode: row.postalCode } : {}),
    },
    city: row.city,
    country: row.country,
    timezone: row.timezone,
    createdAt: toDatabaseTimestamp(row.createdAt),
    updatedAt: toDatabaseTimestamp(row.updatedAt),
  };
}

export function toHallDomain(row: {
  id: string;
  locationId: string;
  location: { organizationId: string };
  name: string;
  number: number;
  status: Hall["status"];
  createdAt: Date;
  updatedAt: Date;
  _count: { seats: number };
}): Hall {
  return {
    id: row.id,
    organizationId: row.location.organizationId,
    locationId: row.locationId,
    name: row.name,
    number: row.number,
    status: row.status,
    seatCount: row._count.seats,
    createdAt: toDatabaseTimestamp(row.createdAt),
    updatedAt: toDatabaseTimestamp(row.updatedAt),
  };
}

export function toSeatDomain(row: {
  id: string;
  hallId: string;
  hall: { locationId: string; location: { organizationId: string } };
  row: string;
  number: number;
  label: string;
  status: Seat["status"];
  createdAt: Date;
  updatedAt: Date;
}): Seat {
  return {
    id: row.id,
    organizationId: row.hall.location.organizationId,
    locationId: row.hall.locationId,
    hallId: row.hallId,
    row: row.row,
    number: row.number,
    label: row.label,
    status: row.status,
    createdAt: toDatabaseTimestamp(row.createdAt),
    updatedAt: toDatabaseTimestamp(row.updatedAt),
  };
}
