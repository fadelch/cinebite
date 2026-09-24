import "server-only";

import { randomUUID } from "node:crypto";

import { applyStockMovementRecord } from "@/server/repositories/inventory-movements.repository";
import { assertInventoryLocationAccess, getInventoryContext } from "@/server/services/inventory.service";
import { stockMovementInputSchema } from "@/validation/inventory";
import { documentIdSchema } from "@/validation/shared";

export async function changeInventoryStock(locationIdInput: string, locationInventoryIdInput: string, input: unknown) {
  const { actor, organization } = await getInventoryContext();
  const locationId = documentIdSchema.parse(locationIdInput);
  assertInventoryLocationAccess(actor, locationId);
  const movement = stockMovementInputSchema.parse(input);
  return applyStockMovementRecord({
    actorUid: actor.uid,
    organizationId: organization.id,
    locationId,
    locationInventoryId: documentIdSchema.parse(locationInventoryIdInput),
    movementId: randomUUID(),
    ...movement,
  });
}
