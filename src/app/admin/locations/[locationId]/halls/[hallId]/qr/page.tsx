import Link from "next/link";

import { SeatQrManager } from "@/components/admin/seat-qr-manager";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getSeatQrHall } from "@/server/services/seat-qr.service";

export const metadata = { title: "Seat QR management" };

export default async function SeatQrPage({ params }: { params: Promise<{ locationId: string; hallId: string }> }) {
  const { locationId, hallId } = await params;
  const hall = await getSeatQrHall(locationId, hallId);
  return <PageTransition><Link href={`/admin/locations/${locationId}/halls/${hallId}`} className="text-sm text-zinc-500 hover:text-zinc-200">← Hall details</Link><header className="mt-6"><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Secure seat access</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Seat QR management</h1><p className="mt-3 text-sm text-zinc-500">{hall.locationName} · {hall.hallName} · Credentials are hashed and scoped to each physical seat.</p></header><SeatQrManager hall={hall} /></PageTransition>;
}
