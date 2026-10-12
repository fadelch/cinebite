import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getAdminAuth } from "@/lib/firebase/admin";

/** No network RPC runs in a business transaction. A durable PG lease prevents
 * overlapping normal syncs; concurrent newer PG versions remain pending. All
 * stale claims fail closed against PG authorizationVersion even if RPC fails. */
export async function synchronizeStaffIdentity(
  userId: string,
  organizationId: string,
) {
  const lease = randomUUID(),
    now = new Date();
  const claimed = await prisma.user.updateMany({
    where: {
      id: userId,
      identitySyncPending: true,
      platformRole: "USER",
      memberships: { some: { organizationId } },
      OR: [
        { identitySyncLeaseUntil: null },
        { identitySyncLeaseUntil: { lt: now } },
      ],
    },
    data: {
      identitySyncLease: lease,
      identitySyncLeaseUntil: new Date(now.getTime() + 10 * 60000),
    },
  });
  if (!claimed.count)
    return {
      pending: Boolean(
        (
          await prisma.user.findUnique({
            where: { id: userId },
            select: { identitySyncPending: true },
          })
        )?.identitySyncPending,
      ),
    };
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: true },
    });
    if (
      user.memberships.length !== 1 ||
      user.memberships[0].organizationId !== organizationId
    )
      throw new Error("unsupported membership");
    const auth = getAdminAuth(),
      identity = await auth.getUser(user.firebaseUid);
    if (
      identity.disabled ||
      identity.email?.toLowerCase() !== user.email.toLowerCase()
    )
      throw new Error("identity unavailable");
    await auth.revokeRefreshTokens(user.firebaseUid);
    await auth.setCustomUserClaims(user.firebaseUid, {
      role: user.memberships[0].role,
      organizationId,
      authorizationVersion: user.authorizationVersion,
    });
    await prisma.user.updateMany({
      where: {
        id: userId,
        authorizationVersion: user.authorizationVersion,
        identitySyncLease: lease,
      },
      data: { identitySyncPending: false, identitySyncErrorCode: null },
    });
  } catch {
    await prisma.user.updateMany({
      where: { id: userId, identitySyncLease: lease },
      data: { identitySyncErrorCode: "IDENTITY_SYNC_UNAVAILABLE" },
    });
  } finally {
    await prisma.user.updateMany({
      where: { id: userId, identitySyncLease: lease },
      data: { identitySyncLease: null, identitySyncLeaseUntil: null },
    });
  }
  return {
    pending: Boolean(
      (
        await prisma.user.findUnique({
          where: { id: userId },
          select: { identitySyncPending: true },
        })
      )?.identitySyncPending,
    ),
  };
}
