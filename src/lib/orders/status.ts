import type { OrderStatus } from "@/types/order";

export const ORDER_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY"] as const;
export const nextOrderStatus: Record<OrderStatus, OrderStatus | null> = {
  PLACED: "ACCEPTED", ACCEPTED: "PREPARING", PREPARING: "READY", READY: null,
};
export const orderStatusLabel: Record<OrderStatus, string> = {
  PLACED: "Order received", ACCEPTED: "Accepted", PREPARING: "Preparing", READY: "Ready",
};
export const orderActionLabel: Record<OrderStatus, string | null> = {
  PLACED: "Accept order", ACCEPTED: "Start preparing", PREPARING: "Mark ready", READY: null,
};

export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return nextOrderStatus[from] === to;
}

export function elapsedOrderTime(timestamp: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60_000));
  return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
