import { describe, expect, it } from "vitest";

import { generateSeatLayout, seatDocumentId } from "@/lib/tenant-admin/seats";
import { generateSeatsSchema, SEAT_GENERATION_LIMITS } from "@/validation/seat";

describe("seat layout generation", () => {
  it("generates canonical labels from server-controlled row and number values", () => {
    const layout = generateSeatLayout({
      startingRow: "a",
      numberOfRows: 10,
      seatsPerRow: 16,
      startingSeatNumber: 1,
    });

    expect(layout.total).toBe(160);
    expect(layout.seats[0]).toEqual({ row: "A", number: 1, label: "A1" });
    expect(layout.seats[15].label).toBe("A16");
    expect(layout.seats.at(-1)?.label).toBe("J16");
  });

  it("continues rows canonically after Z", () => {
    const layout = generateSeatLayout({
      startingRow: "Z",
      numberOfRows: 2,
      seatsPerRow: 1,
      startingSeatNumber: 7,
    });
    expect(layout.seats.map((seat) => seat.label)).toEqual(["Z7", "AA7"]);
  });

  it("uses a deterministic normalized document ID per hall", () => {
    expect(seatDocumentId("AA12")).toBe("aa12");
  });

  it("rejects oversized generation requests and extra client labels", () => {
    expect(
      generateSeatsSchema.safeParse({
        startingRow: "A",
        numberOfRows: SEAT_GENERATION_LIMITS.maxRows,
        seatsPerRow: SEAT_GENERATION_LIMITS.maxSeatsPerRow,
        startingSeatNumber: 1,
      }).success,
    ).toBe(false);
    expect(
      generateSeatsSchema.safeParse({
        startingRow: "ZZZ",
        numberOfRows: 2,
        seatsPerRow: 1,
        startingSeatNumber: 1,
      }).success,
    ).toBe(false);
    expect(
      generateSeatsSchema.safeParse({
        startingRow: "A",
        numberOfRows: 1,
        seatsPerRow: 1,
        startingSeatNumber: 1,
        labels: ["INJECTED1"],
      }).success,
    ).toBe(false);
  });

  it("keeps the maximum request below the Firestore 500-write batch limit", () => {
    expect(SEAT_GENERATION_LIMITS.maxTotalSeats + 2).toBeLessThanOrEqual(500);
  });
});
