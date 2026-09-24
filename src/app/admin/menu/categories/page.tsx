import { MenuCategoryManager } from "@/components/admin/menu-category-manager";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getMenuWorkspaceData } from "@/server/services/menu.service";

export const metadata = { title: "Menu categories" };

export default async function MenuCategoriesPage() {
  const { categories, actor } = await getMenuWorkspaceData();
  return <PageTransition><header><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Cinema menu</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Categories</h1><p className="mt-2 text-sm text-zinc-400">Deterministic organization-wide product grouping.</p></header><MenuCategoryManager initialCategories={categories} canEdit={actor.role === "CINEMA_ADMIN"} /></PageTransition>;
}
