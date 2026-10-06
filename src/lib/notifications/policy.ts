export const NOTIFICATION_TYPES = [
  "NEW_ORDER",
  "ORDER_ACCEPTED",
  "ORDER_PREPARING",
  "ORDER_READY",
  "ORDER_OUT_FOR_DELIVERY",
  "ORDER_DELIVERED",
  "ORDER_CANCELED",
  "PAYMENT_FAILED",
  "REFUND_FAILED",
  "REFUND_SUCCEEDED",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "STOCK_RECOVERED",
  "ORDER_ISSUE_REPORTED",
  "SCREENING_CANCELED",
] as const;
export type NotificationKind = (typeof NOTIFICATION_TYPES)[number];
export const CATEGORIES = [
  "ORDERS",
  "INVENTORY",
  "FINANCIAL",
  "EXCEPTIONS",
] as const;
export type Category = (typeof CATEGORIES)[number];
export function categoryFor(type: NotificationKind): Category {
  if (["LOW_STOCK", "OUT_OF_STOCK", "STOCK_RECOVERED"].includes(type))
    return "INVENTORY";
  if (["PAYMENT_FAILED", "REFUND_FAILED", "REFUND_SUCCEEDED"].includes(type))
    return "FINANCIAL";
  if (["ORDER_ISSUE_REPORTED", "SCREENING_CANCELED"].includes(type))
    return "EXCEPTIONS";
  return "ORDERS";
}
export function mandatory(type: NotificationKind) {
  return [
    "OUT_OF_STOCK",
    "REFUND_FAILED",
    "ORDER_ISSUE_REPORTED",
    "SCREENING_CANCELED",
  ].includes(type);
}
export function severityFor(
  type: NotificationKind,
): "INFO" | "SUCCESS" | "WARNING" | "CRITICAL" {
  if (mandatory(type)) return "CRITICAL";
  if (["LOW_STOCK", "PAYMENT_FAILED", "ORDER_CANCELED"].includes(type))
    return "WARNING";
  if (["ORDER_DELIVERED", "REFUND_SUCCEEDED", "STOCK_RECOVERED"].includes(type))
    return "SUCCESS";
  return "INFO";
}
export function recipientsFor(type: NotificationKind): string[] {
  if (type === "NEW_ORDER") return ["KITCHEN_STAFF"];
  if (type === "ORDER_READY") return ["DELIVERY_STAFF"];
  if (
    [
      "LOW_STOCK",
      "OUT_OF_STOCK",
      "STOCK_RECOVERED",
      "REFUND_FAILED",
      "ORDER_ISSUE_REPORTED",
    ].includes(type)
  )
    return ["CINEMA_ADMIN", "LOCATION_MANAGER"];
  if (type === "SCREENING_CANCELED")
    return [
      "CINEMA_ADMIN",
      "LOCATION_MANAGER",
      "KITCHEN_STAFF",
      "DELIVERY_STAFF",
    ];
  return [];
}
export const customerKinds = new Set<NotificationKind>([
  "ORDER_ACCEPTED",
  "ORDER_PREPARING",
  "ORDER_READY",
  "ORDER_OUT_FOR_DELIVERY",
  "ORDER_DELIVERED",
  "ORDER_CANCELED",
  "PAYMENT_FAILED",
  "REFUND_FAILED",
  "REFUND_SUCCEEDED",
]);
export function retryPolicy(attempt: number, now = new Date()) {
  return {
    status: attempt >= 5 ? ("FAILED" as const) : ("PENDING" as const),
    nextAttemptAt: new Date(
      now.getTime() + Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1)) * 1000,
    ),
  };
}
export function stockState(
  onHand: number,
  reserved: number,
  threshold: number,
) {
  const available = onHand - reserved;
  return available <= 0
    ? "OUT_OF_STOCK"
    : available <= threshold
      ? "LOW_STOCK"
      : "IN_STOCK";
}
export function optionalEnabled(type: NotificationKind, enabled = true) {
  return mandatory(type) || enabled;
}
