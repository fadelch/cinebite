export const ORGANIZATION_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const LOCATION_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export const HALL_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type HallStatus = (typeof HALL_STATUSES)[number];

export const SEAT_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export const USER_ROLES = [
  "SUPER_ADMIN",
  "CINEMA_ADMIN",
  "LOCATION_MANAGER",
  "KITCHEN_STAFF",
  "DELIVERY_STAFF",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
