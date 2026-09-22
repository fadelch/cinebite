"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import type { toHallDto, toSeatDto } from "@/lib/tenant-admin/dto";
import { generateSeatLayout, seatRowOrdinal } from "@/lib/tenant-admin/seats";
import { SEAT_GENERATION_LIMITS } from "@/validation/seat";

type HallDto = ReturnType<typeof toHallDto>;
type SeatDto = ReturnType<typeof toSeatDto>;
type GeneratorInput = {
  startingRow: string;
  numberOfRows: number;
  seatsPerRow: number;
  startingSeatNumber: number;
};

const initialGenerator: GeneratorInput = {
  startingRow: "A",
  numberOfRows: 5,
  seatsPerRow: 10,
  startingSeatNumber: 1,
};

export function HallManagement({
  locationId,
  hall,
  seats,
  locationActive,
}: {
  locationId: string;
  hall: HallDto;
  seats: SeatDto[];
  locationActive: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [generator, setGenerator] = useState(initialGenerator);
  const [preview, setPreview] = useState<ReturnType<typeof generateSeatLayout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [changingSeat, setChangingSeat] = useState<string | null>(null);
  const rows = useMemo(() => {
    const grouped = new Map<string, SeatDto[]>();
    for (const seat of seats) grouped.set(seat.row, [...(grouped.get(seat.row) ?? []), seat]);
    return [...grouped.entries()].sort(([left], [right]) => seatRowOrdinal(left) - seatRowOrdinal(right));
  }, [seats]);

  function updateGenerator<K extends keyof GeneratorInput>(key: K, value: GeneratorInput[K]) {
    setGenerator((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setError(null);
  }

  function buildPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setPreview(generateSeatLayout(generator));
      setError(null);
    } catch (reason) {
      setPreview(null);
      setError(validationMessage(reason));
    }
  }

  async function confirmGeneration() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/locations/${locationId}/halls/${hall.id}/seats/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generator),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "The seats could not be generated."));
      const count = typeof body === "object" && body && "count" in body && typeof body.count === "number" ? body.count : preview?.total;
      setSuccess(`${count ?? "The"} seats were generated successfully.`);
      setPreview(null);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The seats could not be generated.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleHallStatus() {
    const status = hall.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/locations/${locationId}/halls/${hall.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "The hall status could not be changed."));
      setSuccess(status === "ACTIVE" ? "Hall reactivated." : "Hall marked inactive.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The hall status could not be changed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleSeat(seat: SeatDto) {
    const status = seat.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setChangingSeat(seat.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/locations/${locationId}/halls/${hall.id}/seats/${seat.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(body, "The seat status could not be changed."));
      setSuccess(`${seat.label} is now ${status.toLowerCase()}.`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The seat status could not be changed.");
    } finally {
      setChangingSeat(null);
    }
  }

  const structureActive = locationActive && hall.status === "ACTIVE";

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">{seats.length} actual seat {seats.length === 1 ? "record" : "records"}</p>
        <button type="button" className="cb-button-secondary" onClick={toggleHallStatus} disabled={submitting || !locationActive}>
          {hall.status === "ACTIVE" ? "Mark hall inactive" : "Reactivate hall"}
        </button>
      </div>

      {success ? (
        <motion.p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200" initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          {success}
        </motion.p>
      ) : null}
      {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">{error}</p> : null}

      <section className="cb-panel p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Generate seats</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">Preview canonical labels first. Nothing is written until you confirm.</p>
        </div>
        <form onSubmit={buildPreview} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <GeneratorField label="Starting row"><input className="cb-field uppercase" value={generator.startingRow} maxLength={3} onChange={(event) => updateGenerator("startingRow", event.target.value.toUpperCase())} required /></GeneratorField>
          <GeneratorField label="Number of rows"><input className="cb-field" type="number" min={1} max={SEAT_GENERATION_LIMITS.maxRows} value={generator.numberOfRows} onChange={(event) => updateGenerator("numberOfRows", Number(event.target.value))} required /></GeneratorField>
          <GeneratorField label="Seats per row"><input className="cb-field" type="number" min={1} max={SEAT_GENERATION_LIMITS.maxSeatsPerRow} value={generator.seatsPerRow} onChange={(event) => updateGenerator("seatsPerRow", Number(event.target.value))} required /></GeneratorField>
          <GeneratorField label="Starting seat number"><input className="cb-field" type="number" min={1} max={9970} value={generator.startingSeatNumber} onChange={(event) => updateGenerator("startingSeatNumber", Number(event.target.value))} required /></GeneratorField>
          <div className="sm:col-span-2 xl:col-span-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-zinc-600">Maximum {SEAT_GENERATION_LIMITS.maxRows} rows, {SEAT_GENERATION_LIMITS.maxSeatsPerRow} seats per row, and {SEAT_GENERATION_LIMITS.maxTotalSeats} total.</p>
            <button type="submit" className="cb-button-secondary" disabled={!structureActive}>Preview layout</button>
          </div>
        </form>

        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div key="preview" className="mt-6 rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4" initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><h3 className="font-medium text-amber-100">Preview: {preview.total} seats</h3><p className="mt-1 text-xs text-zinc-500">{preview.seats[0]?.label} through {preview.seats.at(-1)?.label}</p></div>
                <button type="button" className="cb-button-primary" onClick={confirmGeneration} disabled={submitting}>{submitting ? "Generating…" : "Confirm generation"}</button>
              </div>
              <div className="mt-4 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" aria-label="Seat generation preview">
                {preview.seats.map((seat) => <span key={seat.label} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[0.7rem] text-zinc-300">{seat.label}</span>)}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Seat grid</h2>
          <p className="mt-1 text-sm text-zinc-500">Select a seat to disable or reactivate it. Seat identity is preserved.</p>
        </div>
        {rows.length === 0 ? (
          <div className="cb-panel px-6 py-12 text-center"><h3 className="font-semibold text-zinc-100">No seats have been configured</h3><p className="mt-2 text-sm text-zinc-500">Use the generator above to preview and create the first seating layout.</p></div>
        ) : (
          <div className="cb-panel overflow-x-auto p-5 sm:p-7">
            <div className="mx-auto mb-8 min-w-max max-w-3xl rounded-t-[50%] border-t-4 border-amber-300/50 pt-3 text-center text-[0.65rem] tracking-[0.32em] text-zinc-600 uppercase">Screen</div>
            <div className="min-w-max space-y-2" aria-label="Hall seating layout">
              {rows.map(([row, rowSeats]) => (
                <div key={row} className="flex items-center gap-3">
                  <span className="w-7 text-center font-mono text-xs text-zinc-600" aria-hidden="true">{row}</span>
                  <div className="flex gap-2">
                    {rowSeats.map((seat) => (
                      <button
                        key={seat.id}
                        type="button"
                        onClick={() => toggleSeat(seat)}
                        disabled={changingSeat === seat.id || !structureActive}
                        aria-label={`${seat.label}, ${seat.status.toLowerCase()}. Activate to ${seat.status === "ACTIVE" ? "disable" : "reactivate"}.`}
                        className={`flex h-11 w-12 flex-col items-center justify-center rounded-lg border font-mono text-[0.7rem] transition-colors ${seat.status === "ACTIVE" ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200 hover:bg-emerald-400/[0.15]" : "border-zinc-700 bg-zinc-900 text-zinc-500 line-through hover:border-amber-400/30"}`}
                      >
                        <span>{seat.label}</span>
                        <span className="text-[0.5rem] no-underline">{seat.status === "ACTIVE" ? "On" : "Off"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function GeneratorField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-zinc-300">{label}<span className="mt-2 block">{children}</span></label>;
}

function responseMessage(body: unknown, fallback: string): string {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

function validationMessage(reason: unknown): string {
  if (
    typeof reason === "object" &&
    reason !== null &&
    "issues" in reason &&
    Array.isArray(reason.issues) &&
    reason.issues.length > 0 &&
    typeof reason.issues[0] === "object" &&
    reason.issues[0] !== null &&
    "message" in reason.issues[0] &&
    typeof reason.issues[0].message === "string"
  ) {
    return reason.issues[0].message;
  }
  return reason instanceof Error ? reason.message : "The seating layout is invalid.";
}
