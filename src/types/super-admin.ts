import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";

export interface OrganizationSummary extends Organization {
  locationCount?: number;
}

export interface CinemaAdministratorSummary {
  uid: string;
  displayName: string;
  email: string;
  active: boolean;
}

export interface OrganizationDetail {
  organization: Organization;
  locations: Location[];
  administrators: CinemaAdministratorSummary[];
}

export interface SuperAdminDashboardData {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  inactiveOrganizations: number;
  recentOrganizations: Organization[];
}

export interface OrganizationOnboardingResult {
  organizationId: string;
  locationId: string;
  administratorUid: string;
  setupLink: string;
}
