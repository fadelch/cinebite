import { describe, expect, it } from "vitest";

import { getScreeningTemporalState } from "@/lib/screenings/temporal-state";

const startsAt = new Date("2026-10-05T17:30:00.000Z");
const endsAt = new Date("2026-10-05T20:19:00.000Z");

describe("screening temporal state", () => {
  it("computes upcoming, live, and ended without persisting them", () => {
    expect(getScreeningTemporalState({ status: "SCHEDULED", startsAt, endsAt, now: new Date("2026-10-05T17:29:59.999Z") })).toBe("UPCOMING");
    expect(getScreeningTemporalState({ status: "SCHEDULED", startsAt, endsAt, now: new Date("2026-10-05T18:00:00.000Z") })).toBe("LIVE");
    expect(getScreeningTemporalState({ status: "SCHEDULED", startsAt, endsAt, now: new Date("2026-10-05T21:00:00.000Z") })).toBe("ENDED");
  });

  it("uses the exact startsAt <= now < endsAt boundary", () => {
    expect(getScreeningTemporalState({ status: "SCHEDULED", startsAt, endsAt, now: startsAt })).toBe("LIVE");
    expect(getScreeningTemporalState({ status: "SCHEDULED", startsAt, endsAt, now: endsAt })).toBe("ENDED");
  });

  it("makes cancellation override clock time", () => {
    expect(getScreeningTemporalState({ status: "CANCELLED", startsAt, endsAt, now: startsAt })).toBe("CANCELLED");
  });
});
