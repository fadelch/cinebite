import type { LocationStatus, OrganizationStatus } from "@/types/status";

export interface OrganizationWizardData {
  organization: {
    name: string;
    slug: string;
    status: OrganizationStatus;
  };
  firstLocation: {
    name: string;
    slug: string;
    status: LocationStatus;
    address: {
      line1: string;
      line2?: string;
      postalCode?: string;
    };
    city: string;
    country: string;
    timezone: string;
  };
  administrator: {
    displayName: string;
    email: string;
  };
}

export type WizardErrors = Record<string, string>;
