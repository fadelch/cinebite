import Link from "next/link";
import { notFound } from "next/navigation";

import { HallManagement } from "@/components/admin/hall-management";
import { PageTransition } from "@/components/super-admin/page-transition";
import { StatusBadge } from "@/components/super-admin/status-badge";
import { toHallDto, toSeatDto } from "@/lib/tenant-admin/dto";
import { getTenantHallDetail } from "@/server/services/tenant-structure.service";

export const metadata = { title: "Hall details" };

export default async function AdminHallPage({ params }: { params: Promise<{ locationId: string; hallId: string }> }) {
  const { locationId, hallId } = await params;
  const detail = await getTenantHallDetail(locationId, hallId);
  if (!detail) notFound();
  return (
    <PageTransition>
      <Link href={`/admin/locations/${detail.location.id}`} className="text-sm text-zinc-500 hover:text-zinc-200">← {detail.location.name}</Link>
      <header className="mt-6">
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Hall {detail.hall.number}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold text-zinc-50">{detail.hall.name}</h1><StatusBadge status={detail.hall.status} /></div>
        <p className="mt-3 text-sm text-zinc-500">{detail.location.name} · {detail.seats.length} seats</p>
      </header>
      <HallManagement locationId={detail.location.id} locationActive={detail.location.status === "ACTIVE"} hall={toHallDto(detail.hall)} seats={detail.seats.map(toSeatDto)} />
    </PageTransition>
  );
}
