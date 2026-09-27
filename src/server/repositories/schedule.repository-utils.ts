import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ServiceError } from "@/server/services/service-error";

export async function scheduleActorId(firebaseUid: string): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { firebaseUid }, select: { id: true } });
  if (!actor) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  return actor.id;
}
