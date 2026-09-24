import "server-only";

import { randomUUID } from "node:crypto";

import { listActiveInventoryItemsRecord } from "@/server/repositories/inventory-items.repository";
import {
  addRecipeComponentRecord,
  getProductRecipeRecord,
  removeRecipeComponentRecord,
  updateRecipeComponentRecord,
} from "@/server/repositories/recipe.repository";
import { getInventoryContext, requireInventoryCatalogEditor } from "@/server/services/inventory.service";
import { recipeComponentInputSchema, recipeComponentUpdateSchema } from "@/validation/inventory";
import { documentIdSchema } from "@/validation/shared";

export async function getRecipeWorkspace(productIdInput: string) {
  const { actor, organization } = await getInventoryContext();
  const productId = documentIdSchema.parse(productIdInput);
  const [recipe, items] = await Promise.all([
    getProductRecipeRecord(organization.id, productId),
    listActiveInventoryItemsRecord(organization.id),
  ]);
  return { ...recipe, items, canEdit: actor.role === "CINEMA_ADMIN" };
}

export async function addRecipeComponent(productIdInput: string, input: unknown) {
  const { actor, organization } = await getInventoryContext();
  requireInventoryCatalogEditor(actor);
  const productId = documentIdSchema.parse(productIdInput);
  const validated = recipeComponentInputSchema.parse(input);
  return addRecipeComponentRecord({ actorUid: actor.uid, organizationId: organization.id, productId, componentId: randomUUID(), ...validated });
}

export async function updateRecipeComponent(productIdInput: string, componentIdInput: string, input: unknown) {
  const { actor, organization } = await getInventoryContext();
  requireInventoryCatalogEditor(actor);
  const { quantityRequired } = recipeComponentUpdateSchema.parse(input);
  return updateRecipeComponentRecord({
    actorUid: actor.uid, organizationId: organization.id,
    productId: documentIdSchema.parse(productIdInput), componentId: documentIdSchema.parse(componentIdInput), quantityRequired,
  });
}

export async function removeRecipeComponent(productIdInput: string, componentIdInput: string) {
  const { actor, organization } = await getInventoryContext();
  requireInventoryCatalogEditor(actor);
  return removeRecipeComponentRecord({
    actorUid: actor.uid, organizationId: organization.id,
    productId: documentIdSchema.parse(productIdInput), componentId: documentIdSchema.parse(componentIdInput),
  });
}
