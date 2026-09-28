import Image from "next/image";
import Link from "next/link";

import { PrintButton } from "@/components/admin/print-button";
import { getSeatQrHall } from "@/server/services/seat-qr.service";

export const metadata = { title: "Printable seat QR labels" };

export default async function SeatQrPrintPage({ params }: { params: Promise<{ locationId: string; hallId: string }> }) {
  const { locationId, hallId } = await params;
  const hall = await getSeatQrHall(locationId, hallId);
  const seats = hall.seats.filter((seat) => seat.qrStatus === "ACTIVE" && seat.imageAvailable);
  return <div className="mx-auto max-w-6xl bg-white p-6 text-zinc-950 print:max-w-none print:p-0"><header className="mb-6 flex items-center justify-between gap-4 print:hidden"><Link href={`/admin/locations/${locationId}/halls/${hallId}/qr`} className="text-sm text-zinc-600 hover:text-zinc-950">← QR management</Link><PrintButton /></header><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">{seats.map((seat) => <article key={seat.id} className="break-inside-avoid rounded-xl border-2 border-zinc-900 p-4 text-center"><p className="text-sm font-black tracking-[0.2em]">CINEBITE</p><Image src={`/api/admin/locations/${locationId}/halls/${hallId}/qr/${seat.id}/image?v=${seat.version}`} alt={`QR code for ${seat.label}`} width={220} height={220} unoptimized className="mx-auto my-3" /><p className="text-xs font-medium">{hall.locationName} · {hall.hallName}</p><p className="mt-1 text-2xl font-black">Seat {seat.label}</p><p className="mt-2 text-xs">Scan to order from your seat</p></article>)}</div></div>;
}
