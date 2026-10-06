import { describe, expect, it } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import {
  financialMetrics,
  percentage,
  growth,
  durationMinutes,
  fillDailyBuckets,
  reportRange,
} from "./policy";
import { csvCell, csvDocument } from "./csv";
import { analyticsFilterSchema } from "@/validation/analytics";

describe("authoritative reporting formulas", () => {
  it("zero-fills known empty calendar days without fabricating empty-period data", () => {
    expect(fillDailyBuckets([], "2026-10-01", "2026-10-03")).toEqual([]);
    const rows = fillDailyBuckets(
      [{ day: "2026-10-02", currency: "USD", gross: "5.00" }],
      "2026-10-01",
      "2026-10-03",
    );
    expect(rows.map((row) => row.gross)).toEqual(["0.00", "5.00", "0.00"]);
  });
  it("calculates net and gross AOV using exact decimal cents", () =>
    expect(financialMetrics("30", "5", 2)).toEqual({
      gross: "30.00",
      refunded: "5.00",
      net: "25.00",
      aov: "15.00",
      revenueRefundRate: "16.67",
    }));
  it("returns safe zero AOV and undefined refund rate without captures", () =>
    expect(financialMetrics("0", "0", 0)).toMatchObject({
      aov: "0.00",
      revenueRefundRate: null,
    }));
  it("permits negative period net for refunds of older captures", () =>
    expect(financialMetrics("0", "10", 0).net).toBe("-10.00"));
  it("does not use floating point for fractional financial calculations", () =>
    expect(financialMetrics("0.30", "0.10", 3)).toMatchObject({
      net: "0.20",
      aov: "0.10",
    }));
  it("reports cancellation rate with an explicit created-cohort denominator", () =>
    expect(percentage(1, 3)).toBe("33.33"));
  it("does not divide an empty cohort", () =>
    expect(percentage(0, 0)).toBeNull());
  it("does not show infinite growth", () =>
    expect(growth("100", "0")).toBeNull());
  it("handles safe negative previous-period growth", () =>
    expect(growth("50", "100")).toBe("-50.00"));
  it.each([
    ["2026-10-01T17:00:00Z", "2026-10-01T17:06:00Z", 6],
    ["2026-10-01T17:07:00Z", "2026-10-01T17:11:00Z", 4],
    ["2026-10-01T17:00:00Z", "2026-10-01T17:11:00Z", 11],
  ])("uses valid completed event pairs", (a, b, expected) =>
    expect(durationMinutes(new Date(a), new Date(b))).toBe(expected),
  );
  it("excludes incomplete durations instead of inventing zero", () =>
    expect(durationMinutes(new Date(), null)).toBeNull());
  it("excludes negative timelines", () =>
    expect(
      durationMinutes(new Date("2026-10-02"), new Date("2026-10-01")),
    ).toBeNull());
});
describe("calendar boundaries and validated filters", () => {
  const now = Temporal.Instant.from("2026-10-06T22:30:00Z");
  const range = (input: Record<string, unknown>) =>
    reportRange(analyticsFilterSchema.parse(input), "Asia/Beirut", now);
  it("uses Beirut calendar today, not UTC or browser date", () =>
    expect(range({ period: "today" })).toMatchObject({
      startDate: "2026-10-07",
      start: new Date("2026-10-06T21:00:00Z"),
      end: new Date("2026-10-07T21:00:00Z"),
    }));
  it("uses adjacent half-open ranges", () =>
    expect(range({ period: "yesterday" }).end).toEqual(
      range({ period: "today" }).start,
    ));
  it("last 7 days includes today plus six days", () =>
    expect(range({ period: "7d" }).days).toBe(7));
  it("last 30 days contains thirty calendar days", () =>
    expect(range({ period: "30d" }).days).toBe(30));
  it("this month starts at the first calendar day", () =>
    expect(range({ period: "month" }).startDate).toBe("2026-10-01"));
  it("previous month ends at its last day", () =>
    expect(range({ period: "previous-month" })).toMatchObject({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    }));
  it("honors a 25-hour Beirut autumn DST day", () => {
    const r = range({
      period: "custom",
      start: "2026-10-24",
      end: "2026-10-24",
    });
    expect(r.end.getTime() - r.start.getTime()).toBe(25 * 3600000);
  });
  it("honors a 23-hour Beirut spring DST day", () => {
    const r = range({
      period: "custom",
      start: "2026-03-29",
      end: "2026-03-29",
    });
    expect(r.end.getTime() - r.start.getTime()).toBe(23 * 3600000);
  });
  it.each([
    { period: "custom" },
    { period: "custom", start: "2026-02-30", end: "2026-03-02" },
    { period: "custom", start: "2026-10-02", end: "2026-10-01" },
    { period: "custom", start: "2020-01-01", end: "2026-01-01" },
  ])("rejects invalid or unbounded range", (input) =>
    expect(() => range(input)).toThrow(),
  );
  it.each([
    { organizationId: "foreign" },
    { report: "passwords" },
    { sort: "gross; DROP TABLE orders" },
    { page: -1 },
    { pageSize: 50000 },
    { locationId: ["A", "B"] },
    { currencyCode: "US;" },
  ])("strictly rejects unsafe filters", (input) =>
    expect(analyticsFilterSchema.safeParse(input).success).toBe(false),
  );
});
describe("CSV formula injection and exact formatting", () => {
  it.each(["=2+2", "@TEST", "+SUM(A1)", "-2+1", " \t=1", "\r\n@TEST"])(
    "protects untrusted spreadsheet formulas",
    (value) => expect(csvCell(value)).toMatch(/^"'/),
  );
  it("quotes commas, newlines and double quotes", () =>
    expect(csvCell('Popcorn, "large"\n')).toBe('"Popcorn, ""large""\n"'));
  it("keeps server numeric values numeric text", () =>
    expect(csvCell(-12)).toBe('"-12"'));
  it("does not rewrite normal product names", () =>
    expect(csvCell("Large Popcorn")).toBe('"Large Popcorn"'));
  it("uses BOM, CRLF and exact decimal strings", () =>
    expect(csvDocument(["Amount"], [["123.45"], [null]])).toBe(
      '\uFEFF"Amount"\r\n"123.45"\r\n""\r\n',
    ));
});
