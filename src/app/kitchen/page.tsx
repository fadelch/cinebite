import { ProtectedPlaceholder } from "@/components/auth/protected-placeholder";
import { requirePageRole } from "@/server/auth/page-guards";

export default async function KitchenPage() {
  const user = await requirePageRole(["KITCHEN_STAFF"]);

  return (
    <ProtectedPlaceholder
      title="Kitchen staff access"
      description="Your kitchen role is authorized. Kitchen order functionality is intentionally deferred."
      user={user}
    />
  );
}
