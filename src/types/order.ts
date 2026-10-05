export type OrderStatus = "PLACED" | "ACCEPTED" | "PREPARING" | "READY";

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
  counts: Record<OrderStatus, number>;
  page: number;
  pageSize: number;
  fetchedAt: string;
}
