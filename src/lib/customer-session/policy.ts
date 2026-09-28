export const CUSTOMER_SESSION_COOKIE = "cinebite_guest_session";
export const DEFAULT_SESSION_GRACE_MINUTES = 15;
export const DEFAULT_SESSION_MAX_HOURS = 6;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function customerSessionExpiry(screeningEndsAt: Date, now: Date): Date {
  const graceMinutes = positiveNumber(process.env.CUSTOMER_SESSION_GRACE_MINUTES, DEFAULT_SESSION_GRACE_MINUTES);
  const maximumHours = positiveNumber(process.env.CUSTOMER_SESSION_MAX_HOURS, DEFAULT_SESSION_MAX_HOURS);
  const screeningBoundary = screeningEndsAt.getTime() + graceMinutes * 60_000;
  const absoluteBoundary = now.getTime() + maximumHours * 3_600_000;
  return new Date(Math.min(screeningBoundary, absoluteBoundary));
}

export function customerSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
