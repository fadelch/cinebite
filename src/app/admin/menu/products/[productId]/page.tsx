import { notFound } from "next/navigation";

import { MenuProductEditor } from "@/components/admin/menu-product-editor";
import { RecipeManager } from "@/components/admin/recipe-manager";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getMenuWorkspaceData, getProductForMenu } from "@/server/services/menu.service";
import { getRecipeWorkspace } from "@/server/services/recipe.service";
import { ServiceError } from "@/server/services/service-error";

export default async function MenuProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const [detail, workspace, recipe] = await Promise.all([
    getProductForMenu(productId),
    getMenuWorkspaceData(),
    getRecipeWorkspace(productId),
  ]).catch((error: unknown) => {
    if (error instanceof ServiceError && error.code === "PRODUCT_NOT_FOUND") notFound();
    throw error;
  });
  return <PageTransition><header><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Cinema menu</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">{detail.product.name}</h1><p className="mt-2 text-sm text-zinc-400">Catalog identity, per-location offers, and inventory recipe.</p></header><MenuProductEditor product={detail.product} categories={workspace.categories} locations={workspace.locations} canEditCatalog={detail.canEditCatalog} /><RecipeManager productId={productId} components={recipe.components} items={recipe.items} canEdit={recipe.canEdit} /></PageTransition>;
}
