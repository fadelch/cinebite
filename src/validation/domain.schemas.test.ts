import { describe, expect, it } from "vitest";

import { createHallSchema } from "@/validation/hall";
import { createLocationSchema } from "@/validation/location";
import { createOrganizationSchema } from "@/validation/organization";
import { createSeatSchema } from "@/validation/seat";
import { slugSchema } from "@/validation/shared";

describe("slugSchema", () => {
  it.each(["abc-cinemas", "cinema-21", "beirut"])(
    "accepts %s",
    (slug) => {
      expect(slugSchema.parse(slug)).toBe(slug);
    },
  );

  it.each(["ABC Cinemas!!", "has spaces", "double--hyphen", "-leading"])(
    "rejects %s",
    (slug) => {
      expect(() => slugSchema.parse(slug)).toThrow();
    },
  );
});

describe("createOrganizationSchema", () => {
  it("accepts a valid organization and supplies a safe default status", () => {
    const organization = createOrganizationSchema.parse({
      name: "ABC Cinemas",
      slug: "abc-cinemas",
    });

    expect(organization.status).toBe("ACTIVE");
  });

  it("rejects arbitrary statuses and browser-supplied timestamps", () => {
    expect(
      createOrganizationSchema.safeParse({
        name: "ABC Cinemas",
        slug: "abc-cinemas",
        status: "DELETED",
      }).success,
    ).toBe(false);

    expect(
      createOrganizationSchema.safeParse({
        name: "ABC Cinemas",
        slug: "abc-cinemas",
        createdAt: new Date(),
      }).success,
    ).toBe(false);
  });
});

describe("createLocationSchema", () => {
  const validLocation = {
    name: "Achrafieh",
    slug: "achrafieh",
    address: { line1: "Cinema District" },
    city: "Beirut",
    country: "LB",
    timezone: "Asia/Beirut",
  };

  it("accepts a valid location", () => {
    expect(createLocationSchema.parse(validLocation)).toMatchObject({
      status: "ACTIVE",
      country: "LB",
    });
  });

  it("rejects invalid timezone and browser-supplied tenant context", () => {
    expect(
      createLocationSchema.safeParse({
        ...validLocation,
        timezone: "Beirut time",
      }).success,
    ).toBe(false);

    expect(
      createLocationSchema.safeParse({
        ...validLocation,
        organizationId: "browser-selected-tenant",
      }).success,
    ).toBe(false);
  });
});

describe("createHallSchema", () => {
  it("requires positive integer hall numbers and nonnegative seat counts", () => {
    expect(
      createHallSchema.safeParse({ name: "IMAX Hall", number: 1 }).success,
    ).toBe(true);
    expect(
      createHallSchema.safeParse({
        name: "IMAX Hall",
        number: 1.5,
        seatCount: -1,
      }).success,
    ).toBe(false);
  });
});

describe("createSeatSchema", () => {
  it("accepts a label that matches the row and number", () => {
    expect(
      createSeatSchema.safeParse({ row: "G", number: 12, label: "G12" })
        .success,
    ).toBe(true);
  });

  it("rejects mismatched labels, invalid rows, and invalid seat numbers", () => {
    expect(
      createSeatSchema.safeParse({ row: "G", number: 12, label: "G13" })
        .success,
    ).toBe(false);
    expect(
      createSeatSchema.safeParse({ row: "g", number: 12, label: "G12" })
        .success,
    ).toBe(false);
    expect(
      createSeatSchema.safeParse({ row: "G", number: 0, label: "G0" })
        .success,
    ).toBe(false);
  });
});
