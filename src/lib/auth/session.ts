import {
  AUTH_CLOCK_SKEW_SECONDS,
  RECENT_LOGIN_MAX_AGE_SECONDS,
} from "@/lib/auth/constants";

export function isRecentLogin(
  authenticationTimeSeconds: number,
  currentTimeMilliseconds = Date.now(),
): boolean {
  const currentTimeSeconds = Math.floor(currentTimeMilliseconds / 1_000);
  const tokenAgeSeconds = currentTimeSeconds - authenticationTimeSeconds;

  return (
    tokenAgeSeconds >= -AUTH_CLOCK_SKEW_SECONDS &&
    tokenAgeSeconds <= RECENT_LOGIN_MAX_AGE_SECONDS
  );
}
