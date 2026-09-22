import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const transaction = {
    hall: { findFirst: vi.fn() },
    seat: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    transaction,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database.prisma }));

import {
  generateSeatsRecord,
  setSeatStatusRecord,
} from "@/server/repositories/tenant-structure.repository";

const now = new Date("2026-09-22T12:00:00.000Z");
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

function seatRow(label: string, status: "ACTIVE" | "DISABLED" = "ACTIVE") {
  return {
    id: label.toLowerCase(),
    hallId: "hall-1",
    row: label.replace(/\d+$/, ""),
    number: Number(label.match(/\d+$/)?.[0]),
    label,
    status,
    createdAt: now,
    updatedAt: now,
    hall: {
      locationId: "location-1",
      location: { organizationId: "org-1" },
    },
  };
}

describe("Prisma tenant structure seat repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.prisma.user.findUnique.mockResolvedValue({ id: "actor-db-id" });
    database.prisma.$transaction.mockImplementation(
      async (operation: (client: typeof database.transaction) => unknown) =>
        operation(database.transaction),
    );
    database.transaction.hall.findFirst.mockResolvedValue({
      id: "hall-1",
      locationId: "location-1",
      status: "ACTIVE",
      location: {
        organizationId: "org-1",
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
    });
    database.transaction.seat.findFirst.mockResolvedValue(null);
    database.transaction.seat.createMany.mockResolvedValue({ count: 2 });
    database.transaction.seat.findMany.mockResolvedValue([
      seatRow("A1"),
      seatRow("A2"),
    ]);
  });

  it("persists generated seats and their audit event in one Prisma transaction", async () => {
    const seats = await generateSeatsRecord(input);

    expect(database.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(database.transaction.seat.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ id: "a1", hallId: "hall-1", label: "A1" }),
        expect.objectContaining({ id: "a2", hallId: "hall-1", label: "A2" }),
      ],
    });
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "SEATS_GENERATED",
        actorUserId: "actor-db-id",
        organizationId: "org-1",
        metadata: expect.objectContaining({ count: 2 }),
      }),
    });
    expect(seats.map((seat) => seat.label)).toEqual(["A1", "A2"]);
  });

  it("rejects a duplicate before any create or audit write", async () => {
    database.transaction.seat.findFirst.mockResolvedValue({ label: "A1" });

    await expect(generateSeatsRecord(input)).rejects.toMatchObject({
      code: "DUPLICATE_SEAT",
      status: 409,
    });
    expect(database.transaction.seat.createMany).not.toHaveBeenCalled();
    expect(database.transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("changes seat status using the hall-scoped key and writes an audit event", async () => {
    database.transaction.seat.findUnique.mockResolvedValue({
      ...seatRow("A1"),
      hall: {
        locationId: "location-1",
        status: "ACTIVE",
        location: {
          organizationId: "org-1",
          status: "ACTIVE",
          organization: { status: "ACTIVE" },
        },
      },
    });
    database.transaction.seat.update.mockResolvedValue(seatRow("A1", "DISABLED"));

    const result = await setSeatStatusRecord({
      actorUid: "manager-1",
      organizationId: "org-1",
      locationId: "location-1",
      hallId: "hall-1",
      seatId: "a1",
      auditLogId: "audit-2",
      status: "DISABLED",
    });

    expect(database.transaction.seat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hallId_id: { hallId: "hall-1", id: "a1" } },
        data: { status: "DISABLED" },
      }),
    );
    expect(database.transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "SEAT_DISABLED", entityId: "a1" }),
    });
    expect(result.status).toBe("DISABLED");
  });
});
