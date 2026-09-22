import type { Hall } from "@/types/hall";
import type { Location } from "@/types/location";
import type { Organization } from "@/types/organization";
import type { Seat } from "@/types/seat";
import type { UserRole } from "@/types/status";

export interface TenantDashboardData {
  organization: Organization;
  locations: Location[];
  totalHalls: number;
  totalSeats: number;
}

export interface TenantLocationDetail {
  location: Location;
  halls: Hall[];
}

export interface TenantHallDetail {
  location: Location;
  hall: Hall;
  seats: Seat[];
}

export interface TenantShellContext {
  organizationName: string;
  user: {
    displayName: string;
    email: string;
    role: Extract<UserRole, "CINEMA_ADMIN" | "LOCATION_MANAGER">;
  };
}

export interface GeneratedSeatLayout {
  seats: Array<{ row: string; number: number; label: string }>;
  total: number;
}
