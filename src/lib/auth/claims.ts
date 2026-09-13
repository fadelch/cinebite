import type { UserProfile } from "@/types/user";

interface TokenProfileClaims {
  readonly email?: string;
  readonly role?: unknown;
  readonly organizationId?: unknown;
}

type ProfileClaims = Pick<
  UserProfile,
  "email" | "role" | "organizationId"
>;

/**
 * Firebase session cookies omit custom claims whose value is null. Treating an
 * absent organization claim as null preserves the SUPER_ADMIN invariant while
 * still rejecting every tenant profile, which must have a real organization ID.
 */
export function claimsMatchProfile(
  token: TokenProfileClaims,
  profile: ProfileClaims,
): boolean {
  return (
    token.role === profile.role &&
    (token.organizationId ?? null) === profile.organizationId &&
    token.email === profile.email
  );
}
