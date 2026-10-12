import type { BRAND_ACCENTS, STAFF_ROLES } from "@/validation/settings";
export type StaffRole = (typeof STAFF_ROLES)[number];
export interface PublicBranding {
  name: string;
  logoUrl: string | null;
  accent: (typeof BRAND_ACCENTS)[number];
  supportEmail: string | null;
  supportPhone: string | null;
  website: string | null;
}
export interface OrganizationSettingsDto {
  name: string;
  customerFacingName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  website: string | null;
  accent: PublicBranding["accent"];
  logoUrl: string | null;
  version: number;
  canEdit: boolean;
  locations: Array<{ id: string; name: string; timezone: string }>;
}
export interface LocationSettingsDto {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
  city: string;
  country: string;
  timezone: string;
  version: number;
  canEdit: boolean;
}
export interface StaffDto {
  id: string;
  displayName: string;
  email: string;
  role: StaffRole;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  locations: Array<{ id: string; name: string }>;
  organizationWide: boolean;
  revision: number;
  joinedAt: string;
  identitySyncPending: boolean;
  canManage: boolean;
  self: boolean;
  audits?: Array<{
    id: string;
    action: string;
    actor: string;
    createdAt: string;
    summary: string;
  }>;
}
export interface StaffListDto {
  items: StaffDto[];
  total: number;
  page: number;
  pageSize: number;
  locations: Array<{ id: string; name: string }>;
}
