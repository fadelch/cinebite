import { ProtectedPlaceholder } from "@/components/auth/protected-placeholder";
import { requirePageRole } from "@/server/auth/page-guards";

export default async function SuperAdminPage() {
  const user = await requirePageRole(["SUPER_ADMIN"]);

  return (
    <ProtectedPlaceholder
      title="Super Admin access"
      description="Your platform-wide authorization is working. Management functionality is intentionally deferred."
      user={user}
    />
  );
}
