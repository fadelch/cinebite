import { MenuProductForm } from "@/components/admin/menu-product-form";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getMenuWorkspaceData } from "@/server/services/menu.service";
import { redirect } from "next/navigation";

export const metadata = { title: "Add menu product" };

export default async function NewMenuProductPage() {
  const workspace = await getMenuWorkspaceData();
  if (workspace.actor.role !== "CINEMA_ADMIN") redirect("/admin/menu/products");
  return <PageTransition><header><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Cinema menu</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Add product</h1><p className="mt-2 text-sm text-zinc-400">Create the catalog identity, image, and initial location assignments together.</p></header><MenuProductForm categories={workspace.categories} locations={workspace.locations} /></PageTransition>;
}
