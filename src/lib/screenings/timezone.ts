import { Temporal } from "@js-temporal/polyfill";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertTimeZone(timeZone: string): string {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone);
    return timeZone;
  } catch {
    throw new RangeError("The location timezone is invalid.");
  }
}

export function localDateTimeToInstant(localDateTime: string, timeZoneInput: string): Date {
  if (!LOCAL_DATE_TIME.test(localDateTime)) throw new RangeError("Use a complete local date and time.");
  const timeZone = assertTimeZone(timeZoneInput);
  try {
    const instant = Temporal.PlainDateTime.from(localDateTime)
      .toZonedDateTime(timeZone, { disambiguation: "reject" })
      .toInstant();
    return new Date(instant.epochMilliseconds);
  } catch {
    throw new RangeError("This local time is invalid or ambiguous in the location timezone.");
  }
}

export function instantToLocalInput(value: Date | string, timeZoneInput: string): string {
  const timeZone = assertTimeZone(timeZoneInput);
  return Temporal.Instant.from(new Date(value).toISOString())
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

export function formatInTimeZone(
  value: Date | string,
  timeZoneInput: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const timeZone = assertTimeZone(timeZoneInput);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}

export function localDateBounds(date: string, timeZoneInput: string): { start: Date; end: Date } {
  if (!LOCAL_DATE.test(date)) throw new RangeError("Use a valid schedule date.");
  const timeZone = assertTimeZone(timeZoneInput);
  const start = Temporal.PlainDate.from(date).toPlainDateTime().toZonedDateTime(timeZone, { disambiguation: "reject" });
  return {
    start: new Date(start.toInstant().epochMilliseconds),
    end: new Date(start.add({ days: 1 }).toInstant().epochMilliseconds),
  };
}

export function suggestEndLocal(startLocal: string, durationMinutes: number, timeZoneInput: string): string {
  const start = localDateTimeToInstant(startLocal, timeZoneInput);
  const end = Temporal.Instant.from(start.toISOString()).add({ minutes: durationMinutes });
  return end.toZonedDateTimeISO(assertTimeZone(timeZoneInput)).toPlainDateTime().toString({ smallestUnit: "minute" });
}

export function todayInTimeZone(timeZoneInput: string, now = Temporal.Now.instant()): string {
  return now.toZonedDateTimeISO(assertTimeZone(timeZoneInput)).toPlainDate().toString();
}
