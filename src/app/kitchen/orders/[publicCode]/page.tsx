import { notFound } from "next/navigation";

import { KitchenDetailClient } from "@/components/kitchen/kitchen-detail-client";
import { requirePageRole } from "@/server/auth/page-guards";
import { getKitchenOrder } from "@/server/services/kitchen.service";

export const metadata = { title: "Kitchen ticket | CineBite" };

export default async function KitchenOrderPage({ params }: { params: Promise<{ publicCode: string }> }) {
  await requirePageRole(["KITCHEN_STAFF", "LOCATION_MANAGER", "CINEMA_ADMIN"]);
  const order = await getKitchenOrder((await params).publicCode).catch(() => null);
  if (!order) notFound();
  return <KitchenDetailClient initialOrder={order} />;
}
