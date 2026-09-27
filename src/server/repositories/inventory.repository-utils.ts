import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ServiceError } from "@/server/services/service-error";

export async function inventoryActorId(firebaseUid: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { firebaseUid }, select: { id: true } });
  if (!user) throw new ServiceError("AUTHENTICATION_REQUIRED", 401, "Authentication is required.");
  return user.id;
}

export type TransactionClient = Prisma.TransactionClient;
