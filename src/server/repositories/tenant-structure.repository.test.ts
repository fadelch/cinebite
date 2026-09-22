import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: vi.fn() }));

import { getAdminFirestore } from "@/lib/firebase/admin";
import { generateSeatsRecord } from "@/server/repositories/tenant-structure.repository";

const timestamp = {
  seconds: 1,
  nanoseconds: 0,
  toDate: () => new Date(1_000),
};

function snapshot(path: string, data?: Record<string, unknown>) {
  return {
    id: path.split("/").at(-1) ?? path,
    exists: data !== undefined,
    data: () => data,
  };
}

function fakeFirestore(existingSeatLabel?: string) {
  const create = vi.fn();
  const update = vi.fn();
  const commit = vi.fn().mockResolvedValue([]);
  const batch = { create, update, commit };
  let getAllCalls = 0;
  const database = {
    doc: vi.fn((path: string) => ({ path })),
    batch: vi.fn(() => batch),
    getAll: vi.fn(async (...references: Array<{ path: string }>) => {
      getAllCalls += 1;
      if (getAllCalls === 1) {
        return references.map((reference, index) => {
          if (index === 0) {
            return snapshot(reference.path, {
              name: "Empire Cinemas",
              slug: "empire-cinemas",
              status: "ACTIVE",
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          }
          if (index === 1) {
            return snapshot(reference.path, {
              name: "Downtown",
              slug: "downtown",
              status: "ACTIVE",
              address: { line1: "Cinema Street" },
              city: "Beirut",
              country: "LB",
              timezone: "Asia/Beirut",
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          }
          if (index === 2) {
            return snapshot(reference.path, {
              name: "Grand Hall",
              number: 1,
              status: "ACTIVE",
              seatCount: existingSeatLabel ? 1 : 0,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          }
          const label = reference.path.split("/").at(-1)?.toUpperCase();
          return snapshot(
            reference.path,
            label === existingSeatLabel
              ? {
                  row: label?.replace(/\d+$/, ""),
                  number: Number(label?.match(/\d+$/)?.[0]),
                  label,
                  status: "ACTIVE",
                  createdAt: timestamp,
                  updatedAt: timestamp,
                }
              : undefined,
          );
        });
      }

      return references.map((reference) => {
        const label = reference.path.split("/").at(-1)?.toUpperCase() ?? "A1";
        return snapshot(reference.path, {
          row: label.replace(/\d+$/, ""),
          number: Number(label.match(/\d+$/)?.[0]),
          label,
          status: "ACTIVE",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });
    }),
  };

  return { database, batch };
}

const input = {
  actorUid: "manager-1",
  organizationId: "org-1",
  locationId: "location-1",
  hallId: "hall-1",
  auditLogId: "audit-1",
  seats: [
    { row: "A", number: 1, label: "A1" },
    { row: "A", number: 2, label: "A2" },
  ],
};

describe("tenant structure seat repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one atomic batch with create-only seats, hall count update, and audit event", async () => {
    const fake = fakeFirestore();
    vi.mocked(getAdminFirestore).mockReturnValue(fake.database as never);

    const seats = await generateSeatsRecord(input);

    expect(fake.database.batch).toHaveBeenCalledTimes(1);
    expect(fake.batch.create).toHaveBeenCalledTimes(3);
    expect(fake.batch.create.mock.calls[0][0]).toMatchObject({
      path: "organizations/org-1/locations/location-1/halls/hall-1/seats/a1",
    });
    expect(fake.batch.create.mock.calls[1][0]).toMatchObject({
      path: "organizations/org-1/locations/location-1/halls/hall-1/seats/a2",
    });
    expect(fake.batch.update).toHaveBeenCalledTimes(1);
    expect(fake.batch.create.mock.calls[2][1]).toMatchObject({
      action: "SEATS_GENERATED",
      actorUid: "manager-1",
      organizationId: "org-1",
      metadata: expect.objectContaining({ count: 2 }),
    });
    expect(fake.batch.commit).toHaveBeenCalledTimes(1);
    expect(seats.map((seat) => seat.label)).toEqual(["A1", "A2"]);
  });

  it("rejects a duplicate before committing and never overwrites it", async () => {
    const fake = fakeFirestore("A1");
    vi.mocked(getAdminFirestore).mockReturnValue(fake.database as never);

    await expect(generateSeatsRecord(input)).rejects.toMatchObject({
      code: "DUPLICATE_SEAT",
      status: 409,
    });
    expect(fake.database.batch).not.toHaveBeenCalled();
    expect(fake.batch.commit).not.toHaveBeenCalled();
  });
});
