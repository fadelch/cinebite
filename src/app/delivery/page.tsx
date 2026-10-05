import { DeliveryQueue } from "@/components/delivery/delivery-queue";
import { requirePageRole } from "@/server/auth/page-guards";
import { getDeliveryQueueRecord } from "@/server/repositories/delivery.repository";
import { getDeliveryContext } from "@/server/services/delivery.service";
import { deliveryQueueQuerySchema } from "@/validation/delivery";

export const metadata = { title: "Delivery operations | CineBite" };
export default async function DeliveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole(["DELIVERY_STAFF", "LOCATION_MANAGER", "CINEMA_ADMIN"]);
  const { actor, locations, staff } = await getDeliveryContext();
  const values = Object.fromEntries(Object.entries(await searchParams).filter(([, value]) => typeof value === "string" && value !== ""));
  const query = deliveryQueueQuerySchema.parse(values);
  if (!query.locationId && locations.length === 1) query.locationId = locations[0].id;
  const queue = await getDeliveryQueueRecord(actor, query);
  return <DeliveryQueue key={JSON.stringify(query)} initialQueue={queue} query={query} locations={locations} staff={staff} supervisor={actor.role !== "DELIVERY_STAFF"} />;
}
