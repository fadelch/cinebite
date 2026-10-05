import "server-only";

import { getCurrentUser } from "@/server/auth/current-user";
import { getKitchenOrderRecord, getKitchenQueueRecord, listKitchenLocationsRecord, transitionKitchenOrderRecord } from "@/server/repositories/kitchen.repository";
import { requireKitchenActor } from "@/server/services/kitchen-access";
import { kitchenQueueQuerySchema, orderTransitionSchema } from "@/validation/kitchen";
import { orderCodeSchema } from "@/validation/order";

export async function getKitchenContext() {
  const actor = requireKitchenActor(await getCurrentUser());
  const locations = await listKitchenLocationsRecord(actor);
  return { actor, locations };
}

export async function getKitchenQueue(input: unknown) {
  const query = kitchenQueueQuerySchema.parse(input);
  const actor = requireKitchenActor(await getCurrentUser());
  return getKitchenQueueRecord(actor, query);
}

export async function getKitchenOrder(publicCodeInput: string) {
  const publicCode = orderCodeSchema.parse(publicCodeInput);
  const actor = requireKitchenActor(await getCurrentUser());
  return getKitchenOrderRecord(actor, publicCode);
}

export async function transitionKitchenOrder(publicCodeInput: string, input: unknown) {
  const publicCode = orderCodeSchema.parse(publicCodeInput);
  const transition = orderTransitionSchema.parse(input);
  const actor = requireKitchenActor(await getCurrentUser());
  return transitionKitchenOrderRecord({ actor, publicCode, ...transition });
}
