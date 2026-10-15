import type { DeliveryOrder, OrderStatus } from "@/types/order";

export const DELIVERY_DRAG_TYPE = "application/x-cinebite-delivery-order";
export type DeliveryColumn = "ready" | "active" | "delivered";
export type DeliveryDrag = { publicOrderCode: string; status: OrderStatus };

export function deliveryNextColumn(order: DeliveryOrder): DeliveryColumn | null {
  if (order.status === "READY" && order.canClaim) return "active";
  if (order.status === "OUT_FOR_DELIVERY" && order.canDeliver && order.assignedToMe) return "delivered";
  return null;
}

/** UX guard only: the API independently checks current role, ownership and state. */
export function deliveryDropOrder(
  orders: readonly DeliveryOrder[], dragged: DeliveryDrag | null,
  target: DeliveryColumn, unavailable: boolean,
): DeliveryOrder | null {
  if (unavailable || !dragged) return null;
  const order = orders.find(candidate => candidate.publicOrderCode === dragged.publicOrderCode);
  return order?.status === dragged.status && deliveryNextColumn(order) === target ? order : null;
}
