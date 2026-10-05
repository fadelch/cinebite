import { KitchenQueue } from "@/components/kitchen/kitchen-queue";
import { requirePageRole } from "@/server/auth/page-guards";
import { getKitchenQueueRecord } from "@/server/repositories/kitchen.repository";
import { getKitchenContext } from "@/server/services/kitchen.service";
import { orderQueueQuerySchema } from "@/validation/kitchen";

export const metadata = { title: "Kitchen operations | CineBite" };

export default async function KitchenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole(["KITCHEN_STAFF", "LOCATION_MANAGER", "CINEMA_ADMIN"]);
  const { actor, locations } = await getKitchenContext();
  const values = Object.fromEntries(Object.entries(await searchParams).filter(([, value]) => typeof value === "string" && value !== ""));
  const query = orderQueueQuerySchema.parse(values);
  if (!query.locationId && locations.length === 1) query.locationId = locations[0].id;
  const queue = await getKitchenQueueRecord(actor, query);
  return <KitchenQueue key={JSON.stringify(query)} initialQueue={queue} locations={locations} query={query} canOpenAdmin={actor.role !== "KITCHEN_STAFF"} />;
}
