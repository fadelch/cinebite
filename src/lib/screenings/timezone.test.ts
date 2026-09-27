import { describe, expect, it } from "vitest";

import { instantToLocalInput, localDateBounds, localDateTimeToInstant, suggestEndLocal } from "@/lib/screenings/timezone";

describe("location-authoritative screening time", () => {
  it("converts Beirut local time to an instant and back deterministically", () => {
    const instant = localDateTimeToInstant("2026-10-05T20:30", "Asia/Beirut");
    expect(instant.toISOString()).toBe("2026-10-05T17:30:00.000Z");
    expect(instantToLocalInput(instant, "Asia/Beirut")).toBe("2026-10-05T20:30");
  });

  it("rejects nonexistent and ambiguous daylight-saving local times", () => {
    expect(() => localDateTimeToInstant("2026-03-08T02:30", "America/New_York")).toThrow(/invalid or ambiguous/i);
    expect(() => localDateTimeToInstant("2026-11-01T01:30", "America/New_York")).toThrow(/invalid or ambiguous/i);
  });

  it("creates DST-aware local-day bounds", () => {
    const bounds = localDateBounds("2026-03-08", "America/New_York");
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("suggests duration-based end time across midnight", () => {
    expect(suggestEndLocal("2026-10-05T23:30", 169, "Asia/Beirut")).toBe("2026-10-06T02:19");
  });
});
