import { requirePageRole } from "@/server/auth/page-guards";
import {
  getStaff,
  listStaff,
} from "@/server/services/staff-management.service";
import { StaffDetailClient } from "@/components/admin/staff-client";
export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requirePageRole(["CINEMA_ADMIN"]);
  const [initial, list] = await Promise.all([
    getStaff((await params).userId),
    listStaff(),
  ]);
  return <StaffDetailClient initial={initial} locations={list.locations} />;
}
