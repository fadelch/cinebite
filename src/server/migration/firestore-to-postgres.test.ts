import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  buildMigrationPlan,
  createMigrationRunner,
  MigrationValidationError,
  migrationCounts,
  type LegacyFirestoreSource,
} from "@/server/migration/firestore-to-postgres";

const timestamp = {
  seconds: 1_700_000_000,
  nanoseconds: 0,
  toDate: () => new Date("2023-11-14T22:13:20.000Z"),
};

function sourceFixture(): LegacyFirestoreSource {
  return {
    organizations: [
      {
        id: "org-1",
        data: {
          name: "CineBite Beirut",
          slug: "cinebite-beirut",
          status: "ACTIVE",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
    locations: [
      {
        id: "location-1",
        organizationId: "org-1",
        data: {
          name: "Downtown",
          slug: "downtown",
          status: "ACTIVE",
          address: { line1: "Cinema Street" },
          city: "Beirut",
          country: "LB",
          timezone: "Asia/Beirut",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
    halls: [
      {
        id: "hall-1",
        organizationId: "org-1",
        locationId: "location-1",
        data: {
          name: "Grand Hall",
          number: 1,
          status: "ACTIVE",
          seatCount: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
    seats: [
      {
        id: "a1",
        organizationId: "org-1",
        locationId: "location-1",
        hallId: "hall-1",
        data: {
          row: "A",
          number: 1,
          label: "A1",
          status: "ACTIVE",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
    users: [
      {
        id: "super-uid",
        data: {
          email: "SUPER@example.com",
          displayName: "Super Admin",
          role: "SUPER_ADMIN",
          organizationId: null,
          locationIds: [],
          allLocations: false,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
      {
        id: "cinema-uid",
        data: {
          email: "cinema@example.com",
          displayName: "Cinema Admin",
          role: "CINEMA_ADMIN",
          organizationId: "org-1",
          locationIds: [],
          allLocations: true,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
      {
        id: "manager-uid",
        data: {
          email: "manager@example.com",
          displayName: "Location Manager",
          role: "LOCATION_MANAGER",
          organizationId: "org-1",
          locationIds: ["location-1"],
          allLocations: false,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
    auditLogs: [
      {
        id: "audit-1",
        data: {
          actorUid: "super-uid",
          action: "ORGANIZATION_CREATED",
          entityType: "ORGANIZATION",
          entityId: "org-1",
          organizationId: "org-1",
          metadata: { slug: "cinebite-beirut" },
          createdAt: timestamp,
        },
      },
    ],
  };
}

describe("Firestore to PostgreSQL migration planning", () => {
  it("maps platform users, tenant memberships, and location access", () => {
    const plan = buildMigrationPlan(sourceFixture());

    expect(plan.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firebaseUid: "super-uid",
          email: "super@example.com",
          platformRole: "SUPER_ADMIN",
        }),
      ]),
    );
    expect(plan.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "cinema-uid",
          role: "CINEMA_ADMIN",
          allLocations: true,
        }),
        expect.objectContaining({
          userId: "manager-uid",
          role: "LOCATION_MANAGER",
          allLocations: false,
        }),
      ]),
    );
    expect(plan.memberships).toHaveLength(2);
    expect(plan.locationAccess).toEqual([
      {
        membershipId: "membership:manager-uid:org-1",
        locationId: "location-1",
        organizationId: "org-1",
      },
    ]);
    expect(plan.seats[0]).toMatchObject({ id: "a1", hallId: "hall-1" });
  });

  it("rejects a cross-tenant location access reference", () => {
    const source = sourceFixture();
    source.users[2] = {
      ...source.users[2],
      data: { ...(source.users[2].data as object), locationIds: ["other-location"] },
    };

    expect(() => buildMigrationPlan(source)).toThrow(MigrationValidationError);
  });

  it("rejects duplicate normalized email identities", () => {
    const source = sourceFixture();
    source.users[2] = {
      ...source.users[2],
      data: { ...(source.users[2].data as object), email: "CINEMA@example.com" },
    };

    expect(() => buildMigrationPlan(source)).toThrow(/Normalized emails/);
  });

  it("performs no PostgreSQL write during the default dry run", async () => {
    const apply = vi.fn();
    const run = createMigrationRunner({
      readSource: vi.fn().mockResolvedValue(sourceFixture()),
      apply,
    });

    const report = await run(false);

    expect(report.mode).toBe("DRY_RUN");
    expect(report.postgresCounts).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  it("passes the validated plan to apply and verifies returned counts", async () => {
    const source = sourceFixture();
    const counts = migrationCounts(buildMigrationPlan(source));
    const apply = vi.fn().mockResolvedValue({ counts, alreadyApplied: false });
    const run = createMigrationRunner({
      readSource: vi.fn().mockResolvedValue(source),
      apply,
    });

    const report = await run(true);

    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ organizations: expect.any(Array) }),
    );
    expect(report).toMatchObject({
      mode: "APPLY",
      postgresCounts: counts,
      alreadyApplied: false,
    });
  });

  it("fails when apply returns a mismatched validation report", async () => {
    const source = sourceFixture();
    const counts = migrationCounts(buildMigrationPlan(source));
    const run = createMigrationRunner({
      readSource: vi.fn().mockResolvedValue(source),
      apply: vi.fn().mockResolvedValue({
        counts: { ...counts, seats: counts.seats + 1 },
        alreadyApplied: false,
      }),
    });

    await expect(run(true)).rejects.toThrow(MigrationValidationError);
  });
});
