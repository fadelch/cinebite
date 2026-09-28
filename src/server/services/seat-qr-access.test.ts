import { describe, expect, it } from "vitest";

import { assertSeatQrLocationAccess, requireSeatQrActor } from "@/server/services/seat-qr-access";
import type { AuthenticatedUser } from "@/types/auth";

const admin: AuthenticatedUser = { uid: "admin", email: "admin@example.test", displayName: "Admin", role: "CINEMA_ADMIN", organizationId: "org-1", locationIds: [], allLocations: true, active: true };
const manager: AuthenticatedUser = { ...admin, uid: "manager", role: "LOCATION_MANAGER", locationIds: ["loc-1"], allLocations: false };

describe("seat QR authorization", () => {
  it("allows Cinema Admin and assigned Location Manager", () => {
    expect(() => requireSeatQrActor(admin)).not.toThrow();
    expect(() => assertSeatQrLocationAccess(requireSeatQrActor(manager), "loc-1")).not.toThrow();
  });

  it("rejects another location, another tenant role, inactive users, and anonymous users", () => {
    expect(() => assertSeatQrLocationAccess(requireSeatQrActor(manager), "loc-2")).toThrow();
    expect(() => requireSeatQrActor({ ...manager, role: "KITCHEN_STAFF" })).toThrow();
    expect(() => requireSeatQrActor({ ...manager, role: "DELIVERY_STAFF" })).toThrow();
    expect(() => requireSeatQrActor({ ...manager, active: false })).toThrow();
    expect(() => requireSeatQrActor(null)).toThrow();
  });
});
