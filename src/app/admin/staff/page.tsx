import { requirePageRole } from "@/server/auth/page-guards";
import { listStaff } from "@/server/services/staff-management.service";
import { staffListSchema } from "@/validation/settings";
import { StaffListClient } from "@/components/admin/staff-client";
export const metadata = { title: "Staff management | CineBite" };
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole(["CINEMA_ADMIN"]);
  const query = staffListSchema.parse(
    Object.fromEntries(
      Object.entries(await searchParams).filter(([, value]) => value !== ""),
    ),
  );
  return <StaffListClient initial={await listStaff(query)} query={query} />;
}
