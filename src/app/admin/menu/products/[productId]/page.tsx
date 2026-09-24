import { notFound } from "next/navigation";

import { MenuProductEditor } from "@/components/admin/menu-product-editor";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getMenuWorkspaceData, getProductForMenu } from "@/server/services/menu.service";
import { ServiceError } from "@/server/services/service-error";

export default async function MenuProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const [detail, workspace] = await Promise.all([
    getProductForMenu(productId),
    getMenuWorkspaceData(),
  ]).catch((error: unknown) => {
    if (error instanceof ServiceError && error.code === "PRODUCT_NOT_FOUND") notFound();
    throw error;
  });
  return <PageTransition><header><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Cinema menu</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">{detail.product.name}</h1><p className="mt-2 text-sm text-zinc-400">Catalog identity and per-location offer settings.</p></header><MenuProductEditor product={detail.product} categories={workspace.categories} locations={workspace.locations} canEditCatalog={detail.canEditCatalog} /></PageTransition>;
}
