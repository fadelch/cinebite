import type { OrderStatus } from "@/types/order";

export const KITCHEN_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY"] as const;
export const ORDER_STATUSES = [...KITCHEN_STATUSES, "OUT_FOR_DELIVERY", "DELIVERED"] as const;
export const nextOrderStatus: Record<OrderStatus, OrderStatus | null> = {
  PLACED: "ACCEPTED", ACCEPTED: "PREPARING", PREPARING: "READY", READY: "OUT_FOR_DELIVERY", OUT_FOR_DELIVERY: "DELIVERED", DELIVERED: null, CANCELED: null,
};
export const orderStatusLabel: Record<OrderStatus, string> = {
  PLACED: "Order received", ACCEPTED: "Accepted", PREPARING: "Preparing", READY: "Ready",
  OUT_FOR_DELIVERY: "On the way", DELIVERED: "Delivered", CANCELED: "Canceled",
};
export const orderActionLabel: Record<OrderStatus, string | null> = {
  PLACED: "Accept order", ACCEPTED: "Start preparing", PREPARING: "Mark ready", READY: null,
  OUT_FOR_DELIVERY: null, DELIVERED: null, CANCELED: null,
};

export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return nextOrderStatus[from] === to;
}

export function isValidKitchenTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ["ACCEPTED", "PREPARING", "READY"].includes(to) && isValidOrderTransition(from, to);
}

export function elapsedOrderTime(timestamp: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60_000));
  return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
