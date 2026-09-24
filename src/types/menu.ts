export type MenuStatus = "ACTIVE" | "INACTIVE";

export interface MenuCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: MenuStatus;
  sortOrder: number;
  productCount: number;
}

export interface ProductLocationDto {
  id: string;
  locationId: string;
  locationName: string;
  price: string;
  currencyCode: string;
  isAvailable: boolean;
}

export interface ProductDto {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description: string;
  sku: string | null;
  imageUrl: string | null;
  status: MenuStatus;
  sortOrder: number;
  updatedAt: string;
  locations: ProductLocationDto[];
}

export interface MenuOverviewDto {
  categoryCount: number;
  productCount: number;
  activeProductCount: number;
  inactiveProductCount: number;
  partiallyUnavailableCount: number;
  recentProducts: ProductDto[];
}
