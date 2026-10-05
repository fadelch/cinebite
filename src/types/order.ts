export type KitchenStatus = "PLACED" | "ACCEPTED" | "PREPARING" | "READY";
export type OrderStatus = KitchenStatus | "OUT_FOR_DELIVERY" | "DELIVERED";

export interface OrderStatusHistoryEntry {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorType: "CUSTOMER" | "STAFF" | "SYSTEM";
  createdAt: string;
  actorDisplayName?: string;
}

export interface CartLine {
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  currencyCode: string;
  lineTotal: string;
  availability: "AVAILABLE" | "OUT_OF_STOCK";
}

export interface CustomerCart {
  items: CartLine[];
  itemCount: number;
  subtotal: string;
  currencyCode: string | null;
}

export interface OrderLine {
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  currencyCode: string;
}

export interface CustomerOrder {
  paymentPolicy?: "LEGACY_NOT_REQUIRED" | "ONLINE_REQUIRED";
  fulfillmentEligible?: boolean;
  publicOrderCode: string;
  status: OrderStatus;
  currencyCode: string;
  subtotal: string;
  total: string;
  customerNote: string | null;
  locationName: string;
  hallName: string;
  seatLabel: string;
  movieTitle: string;
  screeningStartsAt: string;
  createdAt: string;
  items: OrderLine[];
  timezone: string;
  history: OrderStatusHistoryEntry[];
}

export interface AdminOrderSummary extends CustomerOrder {
  id: string;
}

export interface KitchenOrder extends CustomerOrder {
  screeningWarning: string | null;
}

export interface KitchenLocation {
  id: string;
  name: string;
  timezone: string;
}

export interface KitchenQueue {
  orders: KitchenOrder[];
  counts: Record<KitchenStatus, number>;
  page: number;
  pageSize: number;
  fetchedAt: string;
}

export interface DeliveryOrder extends KitchenOrder {
  readyAt: string | null;
  deliveryClaimedAt: string | null;
  deliveredAt: string | null;
  assignedToMe: boolean;
  assignedStaffName: string | null;
  canClaim: boolean;
  canDeliver: boolean;
}

export interface DeliveryQueue {
  ready: DeliveryOrder[];
  active: DeliveryOrder[];
  delivered: DeliveryOrder[];
  counts: { ready: number; active: number; delivered: number };
  page: number;
  pageSize: number;
  fetchedAt: string;
}
