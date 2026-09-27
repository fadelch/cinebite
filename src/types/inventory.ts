export type InventoryUnit = "EACH" | "GRAM" | "MILLILITER";
export type InventoryItemStatus = "ACTIVE" | "INACTIVE";
export type InventoryMovementType = "RECEIVE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "WASTE";
export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface InventoryItemDto {
  id: string;
  name: string;
  sku: string;
  unit: InventoryUnit;
  status: InventoryItemStatus;
  usageLocked: boolean;
  updatedAt: string;
}

export interface LocationInventoryDto {
  id: string;
  locationId: string;
  inventoryItemId: string;
  itemName: string;
  sku: string;
  unit: InventoryUnit;
  itemStatus: InventoryItemStatus;
  quantityOnHand: string;
  lowStockThreshold: string;
  stockStatus: StockStatus;
}

export interface InventoryMovementDto {
  id: string;
  locationInventoryId: string;
  locationId: string;
  locationName: string;
  inventoryItemId: string;
  itemName: string;
  unit: InventoryUnit;
  type: InventoryMovementType;
  quantityDelta: string;
  reason: string | null;
  note: string | null;
  actorDisplayName: string;
  createdAt: string;
}

export interface RecipeComponentDto {
  id: string;
  inventoryItemId: string;
  itemName: string;
  sku: string;
  unit: InventoryUnit;
  status: InventoryItemStatus;
  quantityRequired: string;
}

export interface InventoryLocationOption {
  id: string;
  name: string;
}
