import { ProtectedPlaceholder } from "@/components/auth/protected-placeholder";
import { requirePageRole } from "@/server/auth/page-guards";

export default async function DeliveryPage() {
  const user = await requirePageRole(["DELIVERY_STAFF"]);

  return (
    <ProtectedPlaceholder
      title="Delivery staff access"
      description="Your delivery role is authorized. Delivery workflow functionality is intentionally deferred."
      user={user}
    />
  );
}
