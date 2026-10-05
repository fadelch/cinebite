import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { requireDeliveryActor, requireDeliveryWorker, assertDeliveryLocationAccess, deliveryPermittedLocationIds } from "@/server/services/delivery-access";
import type { AuthenticatedUser } from "@/types/auth";
const user: AuthenticatedUser = { uid: "firebase", email: "demo@example.com", displayName: "Demo", organizationId: "org", role: "DELIVERY_STAFF", active: true, allLocations: false, locationIds: ["beirut"] };
describe("delivery role and scope policy", () => {
  it("rejects anonymous, inactive, missing membership and kitchen/customer roles", () => {
    expect(() => requireDeliveryActor(null, "")).toThrow();
    expect(() => requireDeliveryActor({ ...user, active: false }, "db-user")).toThrow();
    expect(() => requireDeliveryActor({ ...user, organizationId: null }, "db-user")).toThrow();
    for (const role of ["KITCHEN_STAFF", "SUPER_ADMIN"] as const) expect(() => requireDeliveryActor({ ...user, role }, "db-user")).toThrow();
  });
  it("scopes delivery staff and managers while supervisors cannot mutate", () => {
    for (const role of ["DELIVERY_STAFF", "LOCATION_MANAGER"] as const) {
      const actor = requireDeliveryActor({ ...user, role }, "db-user");
      expect(deliveryPermittedLocationIds(actor)).toEqual(["beirut"]);
      expect(() => assertDeliveryLocationAccess(actor, "dbayeh")).toThrow();
      if (role === "LOCATION_MANAGER") expect(() => requireDeliveryWorker(actor)).toThrow();
    }
    const admin = requireDeliveryActor({ ...user, role: "CINEMA_ADMIN" }, "db-user");
    expect(deliveryPermittedLocationIds(admin)).toBeNull();
    expect(admin.organizationId).toBe("org");
    expect(() => requireDeliveryWorker(admin)).toThrow();
  });
});
