import { describe, it, expect } from "vitest";
import { changedLocations, protectLastAdmin } from "./policy";
import { claimsMatchProfile } from "@/lib/auth/claims";
describe("staff lifecycle safety", () => {
  it("protects a last active ready admin, not an uncompleted invite", () => {
    expect(
      protectLastAdmin(
        { role: "CINEMA_ADMIN", active: true, ready: true },
        { role: "KITCHEN_STAFF", active: true },
        1,
      ),
    ).toBe(true);
    expect(
      protectLastAdmin(
        { role: "CINEMA_ADMIN", active: true, ready: true },
        { role: "CINEMA_ADMIN", active: false },
        1,
      ),
    ).toBe(true);
    expect(
      protectLastAdmin(
        { role: "CINEMA_ADMIN", active: true, ready: true },
        { role: "CINEMA_ADMIN", active: false },
        2,
      ),
    ).toBe(false);
    expect(
      protectLastAdmin(
        { role: "CINEMA_ADMIN", active: false, ready: true },
        { role: "CINEMA_ADMIN", active: true },
        1,
      ),
    ).toBe(false);
    expect(
      protectLastAdmin(
        { role: "CINEMA_ADMIN", active: true, ready: false },
        { role: "KITCHEN_STAFF", active: true },
        1,
      ),
    ).toBe(false);
  });
  it("treats locations as a set and detects actual grant removal", () => {
    expect(changedLocations(["a", "b"], ["b", "a"])).toBe(false);
    expect(changedLocations(["a", "b"], ["a"])).toBe(true);
  });
  it("invalidates old role/security-version cookies even after reactivation", () => {
    const profile = {
      email: "demo@example.test",
      role: "KITCHEN_STAFF" as const,
      organizationId: "org",
      authorizationVersion: 2,
    };
    expect(
      claimsMatchProfile({ ...profile, authorizationVersion: 0 }, profile),
    ).toBe(false);
    expect(
      claimsMatchProfile({ ...profile, authorizationVersion: 1 }, profile),
    ).toBe(false);
    expect(claimsMatchProfile(profile, profile)).toBe(true);
    expect(
      claimsMatchProfile({ ...profile, role: "CINEMA_ADMIN" }, profile),
    ).toBe(false);
  });
});
