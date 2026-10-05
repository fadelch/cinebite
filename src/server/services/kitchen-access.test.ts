import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { assertKitchenLocationAccess, kitchenPermittedLocationIds, requireKitchenActor } from "@/server/services/kitchen-access";
import type { AuthenticatedUser } from "@/types/auth";

const staff: AuthenticatedUser = { uid: "staff", email: "staff@example.com", displayName: "Kitchen", role: "KITCHEN_STAFF", organizationId: "org-a", locationIds: ["beirut"], allLocations: false, active: true };

describe("kitchen authorization", () => {
  it.each(["KITCHEN_STAFF", "LOCATION_MANAGER", "CINEMA_ADMIN"] as const)("permits %s", (role) => {
    expect(requireKitchenActor({ ...staff, role }).role).toBe(role);
  });
  it.each(["DELIVERY_STAFF", "SUPER_ADMIN"] as const)("denies %s", (role) => {
    expect(() => requireKitchenActor({ ...staff, role })).toThrow("Kitchen access is not permitted");
  });
  it("requires verified active staff with a tenant", () => {
    expect(() => requireKitchenActor(null)).toThrow("Staff sign-in");
    expect(() => requireKitchenActor({ ...staff, active: false })).toThrow();
    expect(() => requireKitchenActor({ ...staff, organizationId: null })).toThrow();
  });
  it("enforces explicit location grants for kitchen staff and managers", () => {
    for (const role of ["KITCHEN_STAFF", "LOCATION_MANAGER"] as const) {
      const actor = requireKitchenActor({ ...staff, role });
      expect(kitchenPermittedLocationIds(actor)).toEqual(["beirut"]);
      expect(() => assertKitchenLocationAccess(actor, "dbayeh")).toThrow("You do not have access");
    }
  });
  it("permits administrator/all-location grants only within the actor tenant", () => {
    expect(kitchenPermittedLocationIds(requireKitchenActor({ ...staff, role: "CINEMA_ADMIN" }))).toBeNull();
    expect(kitchenPermittedLocationIds(requireKitchenActor({ ...staff, allLocations: true }))).toBeNull();
  });
});
