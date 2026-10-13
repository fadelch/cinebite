import { isValidKitchenTransition } from "./status";
import type { KitchenOrder, KitchenStatus, OrderStatus } from "@/types/order";

export const KITCHEN_DRAG_TYPE = "application/x-cinebite-kitchen-order";
export type KitchenDrag = { publicOrderCode: string; status: OrderStatus };

/** Use only a current queue snapshot from a drag started on this board. */
export function kitchenDropOrder(
  orders: readonly KitchenOrder[], dragged: KitchenDrag | null,
  target: KitchenStatus, unavailable: boolean,
): KitchenOrder | null {
  if (unavailable || !dragged || !isValidKitchenTransition(dragged.status, target)) return null;
  const order = orders.find(candidate => candidate.publicOrderCode === dragged.publicOrderCode);
  return order?.status === dragged.status ? order : null;
}
