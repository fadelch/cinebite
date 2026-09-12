import { ProtectedPlaceholder } from "@/components/auth/protected-placeholder";
import { requirePageRole } from "@/server/auth/page-guards";

export default async function AdminPage() {
  const user = await requirePageRole(["CINEMA_ADMIN", "LOCATION_MANAGER"]);

  return (
    <ProtectedPlaceholder
      title="Cinema administration access"
      description="Your authorized cinema management area is protected. Dashboard functionality is intentionally deferred."
      user={user}
    />
  );
}
