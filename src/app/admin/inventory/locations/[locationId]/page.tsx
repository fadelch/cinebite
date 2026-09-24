import { notFound } from "next/navigation";

import { LocationInventoryManager } from "@/components/admin/location-inventory-manager";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getLocationInventory } from "@/server/services/inventory.service";
import { ServiceError } from "@/server/services/service-error";

export default async function LocationInventoryPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const detail = await getLocationInventory(locationId).catch((error: unknown) => {
    if (error instanceof ServiceError && error.code === "LOCATION_NOT_FOUND") notFound();
    throw error;
  });
  return <PageTransition><header><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Location stock</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">{detail.location.name}</h1><p className="mt-2 text-sm text-zinc-400">Receive, adjust, and record waste without rewriting movement history.</p></header><LocationInventoryManager locationId={locationId} inventory={detail.inventory} availableItems={detail.availableItems} /></PageTransition>;
}
