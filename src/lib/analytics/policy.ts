import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@/generated/prisma/client";
import type { AnalyticsFilters } from "@/validation/analytics";
import type { ReportRow } from "@/types/analytics";

export function fillDailyBuckets(
  rows: ReportRow[],
  start: string,
  end: string,
) {
  if (!rows.length) return [];
  const currencies = [
    ...new Set(rows.map((row) => String(row.currency))),
  ].sort();
  const found = new Map(rows.map((row) => [`${row.day}:${row.currency}`, row]));
  const filled: ReportRow[] = [];
  const last = Temporal.PlainDate.from(end);
  for (
    let day = Temporal.PlainDate.from(start);
    Temporal.PlainDate.compare(day, last) <= 0;
    day = day.add({ days: 1 })
  ) {
    for (const currency of currencies)
      filled.push(
        found.get(`${day}:${currency}`) ?? {
          day: day.toString(),
          currency,
          gross: "0.00",
          refunded: "0.00",
          paid: 0,
          canceled: 0,
          delivered: 0,
        },
      );
  }
  return filled;
}

export function reportRange(
  filters: AnalyticsFilters,
  timezone: string,
  now = Temporal.Now.instant(),
) {
  const today = now.toZonedDateTimeISO(timezone).toPlainDate();
  let start = today,
    end = today;
  if (filters.period === "yesterday") start = end = today.subtract({ days: 1 });
  if (filters.period === "7d") start = today.subtract({ days: 6 });
  if (filters.period === "30d") start = today.subtract({ days: 29 });
  if (filters.period === "month") start = today.with({ day: 1 });
  if (filters.period === "previous-month") {
    start = today.with({ day: 1 }).subtract({ months: 1 });
    end = today.with({ day: 1 }).subtract({ days: 1 });
  }
  if (filters.period === "custom") {
    if (!filters.start || !filters.end)
      throw new RangeError("Custom reports require start and end dates.");
    start = Temporal.PlainDate.from(filters.start);
    end = Temporal.PlainDate.from(filters.end);
  }
  const days = start.until(end).days + 1;
  if (days < 1 || days > 366)
    throw new RangeError("Reports must span between 1 and 366 calendar days.");
  const instant = (date: Temporal.PlainDate) =>
    new Date(date.toZonedDateTime(timezone).epochMilliseconds);
  return {
    startDate: start.toString(),
    endDate: end.toString(),
    start: instant(start),
    end: instant(end.add({ days: 1 })),
    timezone,
    days,
  };
}
export function financialMetrics(
  gross: string,
  refunded: string,
  paidOrders: number,
) {
  const captured = new Prisma.Decimal(gross),
    returned = new Prisma.Decimal(refunded);
  return {
    gross: captured.toFixed(2),
    refunded: returned.toFixed(2),
    net: captured.minus(returned).toFixed(2),
    aov: paidOrders ? captured.div(paidOrders).toFixed(2) : "0.00",
    revenueRefundRate: captured.isZero()
      ? null
      : returned.div(captured).times(100).toFixed(2),
  };
}
export function percentage(numerator: number, denominator: number) {
  return denominator
    ? new Prisma.Decimal(numerator).div(denominator).times(100).toFixed(2)
    : null;
}
export function growth(current: string, previous: string) {
  const baseline = new Prisma.Decimal(previous);
  return baseline.isZero()
    ? null
    : new Prisma.Decimal(current)
        .minus(baseline)
        .div(baseline)
        .times(100)
        .toFixed(2);
}
export function durationMinutes(start?: Date | null, end?: Date | null) {
  if (!start || !end || end < start) return null;
  return (end.getTime() - start.getTime()) / 60000;
}
