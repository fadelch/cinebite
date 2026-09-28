"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useNotifications } from "@/components/ui/notification-provider";
import type { SeatQrHallDto, SeatQrSeatDto } from "@/types/seat-qr";

export function SeatQrManager({ hall }: { hall: SeatQrHallDto }) {
  const router = useRouter();
  const notifications = useNotifications();
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/api/admin/locations/${hall.locationId}/halls/${hall.hallId}/qr`;
  const operational = hall.locationStatus === "ACTIVE" && hall.hallStatus === "ACTIVE";

  async function mutate(path: string, success: string, body?: unknown) {
    setBusy(path);
    try {
      const response = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(result));
      notifications.success(success);
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : "The QR action could not be completed.");
    } finally { setBusy(null); }
  }

  const activeCount = hall.seats.filter((seat) => seat.qrStatus === "ACTIVE").length;
  const missingCount = hall.seats.filter((seat) => seat.qrStatus === "MISSING" && seat.seatStatus === "ACTIVE").length;

  return (
    <div className="mt-8 space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Seats" value={hall.seats.length} />
        <Metric label="Active QR codes" value={activeCount} tone="text-emerald-300" />
        <Metric label="Missing" value={missingCount} tone="text-amber-300" />
      </section>
      <section className="cb-panel flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div><h2 className="font-semibold text-zinc-100">Hall QR operations</h2><p className="mt-1 text-sm text-zinc-500">Generate only missing credentials. Existing seat QR codes are never rotated by this action.</p></div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/admin/locations/${hall.locationId}/halls/${hall.hallId}/qr/print`} className="cb-button-secondary">Printable layout</Link>
          <button className="cb-button-primary" disabled={!operational || missingCount === 0 || busy !== null} onClick={() => mutate("generate", "Missing seat QR codes generated.", { action: "GENERATE_MISSING" })}>{busy === "generate" ? "Generating…" : `Generate missing (${missingCount})`}</button>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {hall.seats.map((seat) => <SeatQrCard key={seat.id} hall={hall} seat={seat} base={base} busy={busy} operational={operational} mutate={mutate} />)}
      </section>
    </div>
  );
}

function SeatQrCard({ hall, seat, base, busy, operational, mutate }: { hall: SeatQrHallDto; seat: SeatQrSeatDto; base: string; busy: string | null; operational: boolean; mutate(path: string, success: string, body?: unknown): Promise<void> }) {
  const disabled = busy !== null || !operational || seat.seatStatus !== "ACTIVE";
  return (
    <article className="cb-panel overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-mono text-2xl font-bold text-zinc-50">{seat.label}</p><p className="mt-1 text-xs text-zinc-600">{seat.qrStatus === "MISSING" ? "No credential" : `Version ${seat.version}`}</p></div>
        <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold tracking-wide ${seat.qrStatus === "ACTIVE" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : seat.qrStatus === "REVOKED" ? "border-red-400/25 bg-red-400/10 text-red-300" : "border-zinc-700 text-zinc-500"}`}>{seat.qrStatus}</span>
      </div>
      <div className="mt-4 flex min-h-40 items-center justify-center rounded-xl border border-zinc-800 bg-white p-3">
        {seat.imageAvailable ? <Image src={`${base}/${seat.id}/image?v=${seat.version}`} alt={`QR code for seat ${seat.label}`} width={156} height={156} unoptimized loading="eager" className={seat.qrStatus === "REVOKED" ? "opacity-25 grayscale" : ""} /> : <p className="text-xs font-medium text-zinc-500">Generate to create QR</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {seat.qrStatus === "MISSING" ? <button className="cb-button-secondary flex-1" disabled={disabled} onClick={() => mutate(`${seat.id}/regenerate`, `${seat.label} QR generated.`)}>Generate</button> : seat.qrStatus === "REVOKED" ? <button className="cb-button-primary flex-1" disabled={disabled} onClick={() => mutate(`${seat.id}/regenerate`, `${seat.label} received a new active QR.`)}>Regenerate</button> : <><button className="cb-button-secondary flex-1" disabled={disabled} onClick={() => mutate(`${seat.id}/rotate`, `${seat.label} QR rotated. The previous code is invalid.`)}>Rotate</button><button className="cb-button-danger flex-1" disabled={disabled} onClick={() => mutate(`${seat.id}/revoke`, `${seat.label} QR revoked.`)}>Revoke</button></>}
      </div>
      <p className="mt-3 text-[0.68rem] leading-5 text-zinc-600">{hall.locationName} · {hall.hallName} · Raw credentials are never displayed.</p>
    </article>
  );
}

function Metric({ label, value, tone = "text-zinc-100" }: { label: string; value: number; tone?: string }) {
  return <div className="cb-panel p-5"><p className="text-xs tracking-[0.14em] text-zinc-600 uppercase">{label}</p><p className={`mt-2 text-3xl font-semibold ${tone}`}>{value}</p></div>;
}

function responseMessage(body: unknown): string {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "The QR action could not be completed.";
}
