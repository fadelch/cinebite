import { describe, it, expect } from "vitest";
import {
  organizationSettingsSchema,
  brandingSettingsSchema,
  inviteStaffSchema,
  editStaffSchema,
  staffStatusSchema,
  staffListSchema,
  ianaTimezone,
} from "./settings";
const organization = {
  name: "Demo Cinema",
  customerFacingName: "Demo Seat Service",
  supportEmail: "cinema@example.test",
  supportPhone: "+961 1 000 000",
  website: "https://example.test",
  version: 0,
};
describe("Phase 18 validation", () => {
  it("allows bounded public cinema settings, not arbitrary tenant/security fields", () => {
    expect(
      organizationSettingsSchema.parse(organization).customerFacingName,
    ).toBe("Demo Seat Service");
    for (const extra of [
      { organizationId: "foreign" },
      { paymentMode: "LEGACY_NOT_REQUIRED" },
      { logoStoragePath: "../victim" },
      { status: "ACTIVE" },
    ])
      expect(
        organizationSettingsSchema.safeParse({ ...organization, ...extra })
          .success,
      ).toBe(false);
  });
  it.each([
    "<script>alert(1)</script>",
    "<style>*{background:white}</style>",
    "hello\u0000",
  ])("rejects unsafe public name %s", (name) => {
    expect(
      organizationSettingsSchema.safeParse({
        ...organization,
        customerFacingName: name,
      }).success,
    ).toBe(false);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,attack",
    "http://example.test",
    "https://user:pass@example.test",
  ])("rejects unsafe website %s", (website) => {
    expect(
      organizationSettingsSchema.safeParse({ ...organization, website })
        .success,
    ).toBe(false);
  });
  it("only accepts controlled accents and never CSS/JS", () => {
    expect(
      brandingSettingsSchema.safeParse({ accent: "TEAL", version: 0 }).success,
    ).toBe(true);
    expect(
      brandingSettingsSchema.safeParse({
        accent: "white;background:url(javascript:alert(1))",
        version: 0,
      }).success,
    ).toBe(false);
    expect(
      brandingSettingsSchema.safeParse({
        accent: "TEAL",
        version: 0,
        css: "body{}",
      }).success,
    ).toBe(false);
  });
  it("excludes SUPER_ADMIN and requires unique valid location selections", () => {
    const input = {
      email: "TEAM@EXAMPLE.TEST",
      displayName: "Demo Team",
      role: "KITCHEN_STAFF",
      locationIds: ["beirut"],
    };
    expect(inviteStaffSchema.parse(input).email).toBe("team@example.test");
    expect(
      inviteStaffSchema.safeParse({ ...input, role: "SUPER_ADMIN" }).success,
    ).toBe(false);
    expect(
      inviteStaffSchema.safeParse({ ...input, locationIds: [] }).success,
    ).toBe(false);
    expect(
      inviteStaffSchema.safeParse({
        ...input,
        locationIds: ["beirut", "beirut"],
      }).success,
    ).toBe(false);
    expect(
      inviteStaffSchema.safeParse({
        ...input,
        role: "CINEMA_ADMIN",
        locationIds: [],
      }).success,
    ).toBe(true);
    expect(
      inviteStaffSchema.safeParse({ ...input, organizationId: "foreign" })
        .success,
    ).toBe(false);
  });
  it("makes email/identity/version and arbitrary active-state editing impossible", () => {
    const input = {
      displayName: "Demo Staff",
      role: "KITCHEN_STAFF",
      locationIds: ["beirut"],
      revision: 0,
      confirmedRoleChange: true,
    };
    for (const extra of [
      { email: "attacker@example.test" },
      { firebaseUid: "victim" },
      { authorizationVersion: 0 },
      { active: true },
      { allLocations: true },
    ])
      expect(editStaffSchema.safeParse({ ...input, ...extra }).success).toBe(
        false,
      );
    expect(
      staffStatusSchema.safeParse({
        active: false,
        revision: 0,
        confirmed: false,
      }).success,
    ).toBe(false);
  });
  it("requires named IANA zones, never fixed offsets or arbitrary strings", () => {
    for (const zone of [
      "Asia/Beirut",
      "Europe/London",
      "America/New_York",
      "UTC",
    ])
      expect(ianaTimezone.safeParse(zone).success).toBe(true);
    for (const zone of ["+03:00", "Etc/GMT+3", "invalid/timezone", ""])
      expect(ianaTimezone.safeParse(zone).success).toBe(false);
  });
  it("bounds list paging and rejects scope injection", () => {
    expect(staffListSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(staffListSchema.safeParse({ organizationId: "other" }).success).toBe(
      false,
    );
    expect(
      staffListSchema.parse({
        role: "DELIVERY_STAFF",
        status: "SUSPENDED",
        page: "2",
      }).page,
    ).toBe(2);
  });
});
