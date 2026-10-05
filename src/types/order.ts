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
  status: "PLACED";
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
}

export interface AdminOrderSummary extends CustomerOrder {
  id: string;
}
