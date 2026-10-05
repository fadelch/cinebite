import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDeliveryOrderRecord, getDeliveryQueueRecord, listDeliveryLocationsRecord, listDeliveryStaffRecord, transitionDeliveryOrderRecord } from "@/server/repositories/delivery.repository";
import { requireDeliveryActor } from "@/server/services/delivery-access";
import { deliveryQueueQuerySchema, deliveryTransitionSchema } from "@/validation/delivery";
import { orderCodeSchema } from "@/validation/order";
async function currentActor() {
  const user = await getCurrentUser();
  const record = user ? await prisma.user.findUnique({ where: { firebaseUid: user.uid }, select: { id: true } }) : null;
  return requireDeliveryActor(user, record?.id ?? "");
}
export async function getDeliveryContext() {
  const actor = await currentActor();
  const [locations, staff] = await Promise.all([listDeliveryLocationsRecord(actor), listDeliveryStaffRecord(actor)]);
  return { actor, locations, staff };
}
export async function getDeliveryQueue(input: unknown) { return getDeliveryQueueRecord(await currentActor(), deliveryQueueQuerySchema.parse(input)); }
export async function getDeliveryOrder(code: string) { return getDeliveryOrderRecord(await currentActor(), orderCodeSchema.parse(code)); }
export async function transitionDeliveryOrder(code: string, input: unknown) { return transitionDeliveryOrderRecord({ actor: await currentActor(), publicCode: orderCodeSchema.parse(code), ...deliveryTransitionSchema.parse(input) }); }
