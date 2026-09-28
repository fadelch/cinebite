import Image from "next/image";

import { StartOrderingButton } from "@/components/customer/start-ordering-button";
import { resolveSeatScan } from "@/server/services/seat-scan.service";

export const metadata = { title: "Scan your seat | CineBite" };

export default async function SeatScanPage({ params }: { params: Promise<{ credential: string }> }) {
  const { credential } = await params;
  const result = await resolveSeatScan(credential);
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,185,66,0.12),transparent_35%),#09090b] px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <Brand />
        {result.state === "READY" ? <ReadyCard credential={credential} context={result.context} /> : result.state === "NO_ACTIVE_SCREENING" ? <UnavailableCard title="No screening is active" message="No screening is currently active for this seat. Please try again once your movie begins." details={`${result.locationName} · ${result.hallName} · Seat ${result.seatLabel}`} /> : <UnavailableCard title="Seat access unavailable" message="This seat code is invalid, inactive, or has been replaced. Please ask a cinema team member for help." />}
      </div>
    </main>
  );
}

function Brand() {
  return <div className="mb-7 flex items-center justify-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-amber-400 text-xl font-black text-zinc-950">C</span><div><p className="font-semibold tracking-wide text-white">CineBite</p><p className="text-[0.65rem] tracking-[0.18em] text-zinc-500 uppercase">Order from your seat</p></div></div>;
}

function ReadyCard({ credential, context }: { credential: string; context: Extract<Awaited<ReturnType<typeof resolveSeatScan>>, { state: "READY" }>["context"] }) {
  const time = new Intl.DateTimeFormat("en", { timeZone: context.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(context.startsAt));
  return <section className="overflow-hidden rounded-[1.75rem] border border-zinc-800 bg-zinc-900/90 shadow-2xl shadow-black/40">{context.moviePosterUrl ? <div className="relative aspect-[16/8] overflow-hidden"><Image src={context.moviePosterUrl} alt="" fill sizes="448px" className="object-cover opacity-65" /><div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" /></div> : null}<div className={context.moviePosterUrl ? "-mt-12 relative p-6" : "p-6"}><p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">Now showing · {time}</p><h1 className="mt-2 text-3xl font-semibold text-white">{context.movieTitle}</h1><div className="mt-6 grid grid-cols-2 gap-3"><Context label="Cinema" value={context.locationName} /><Context label="Hall" value={context.hallName} /><Context label="Your seat" value={context.seatLabel} highlight /><Context label="Access" value="Verified" /></div><p className="mt-6 text-sm leading-6 text-zinc-400">Confirm to create a short-lived session bound only to this seat and the live screening.</p><StartOrderingButton credential={credential} /></div></section>;
}

function Context({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"><p className="text-[0.65rem] tracking-[0.14em] text-zinc-600 uppercase">{label}</p><p className={`mt-1 truncate font-semibold ${highlight ? "text-amber-300" : "text-zinc-100"}`}>{value}</p></div>;
}

function UnavailableCard({ title, message, details }: { title: string; message: string; details?: string }) {
  return <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-900/90 p-7 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-2xl text-amber-300">!</span><h1 className="mt-5 text-2xl font-semibold text-white">{title}</h1>{details ? <p className="mt-2 text-sm font-medium text-zinc-300">{details}</p> : null}<p className="mt-4 text-sm leading-6 text-zinc-500">{message}</p></section>;
}
