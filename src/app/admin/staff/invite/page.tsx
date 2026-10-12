import { requirePageRole } from "@/server/auth/page-guards";
import { listStaff } from "@/server/services/staff-management.service";
import { InviteStaffClient } from "@/components/admin/staff-client";
export default async function InviteStaffPage() {
  await requirePageRole(["CINEMA_ADMIN"]);
  return <InviteStaffClient locations={(await listStaff()).locations} />;
}
