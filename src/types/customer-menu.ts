export interface CustomerMenuProduct {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: string;
  currencyCode: string;
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "NOT_TRACKED";
}

export interface CustomerMenuCategory {
  slug: string;
  name: string;
  products: CustomerMenuProduct[];
}

export interface CustomerMenuContext {
  movieTitle: string;
  locationName: string;
  hallName: string;
  seatLabel: string;
  screeningEndsAt: string;
  categories: CustomerMenuCategory[];
}
