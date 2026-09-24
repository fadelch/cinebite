"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { EmptyState } from "@/components/super-admin/empty-state";
import { StatusBadge } from "@/components/super-admin/status-badge";
import { useNotifications } from "@/components/ui/notification-provider";
import type { toHallDto } from "@/lib/tenant-admin/dto";

type HallDto = ReturnType<typeof toHallDto>;

export function LocationHalls({
  locationId,
  locationActive,
  halls,
}: {
  locationId: string;
  locationActive: boolean;
  halls: HallDto[];
}) {
  const router = useRouter();
  const notifications = useNotifications();
  const reduceMotion = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/locations/${locationId}/halls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          number: Number(form.get("number")),
          status: "ACTIVE",
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : "The hall could not be created.");
      }
      close();
      notifications.success("Hall created successfully.");
      router.push("/admin");
    } catch (reason) {
      notifications.error(
        reason instanceof Error ? reason.message : "The hall could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Halls</h2>
          <p className="mt-1 text-sm text-zinc-500">{halls.length} configured {halls.length === 1 ? "hall" : "halls"}</p>
        </div>
        <button
          type="button"
          className="cb-button-primary"
          onClick={() => setOpen(true)}
          disabled={!locationActive}
          title={locationActive ? undefined : "The location must be active before adding halls."}
        >
          Add hall
        </button>
      </div>

      {halls.length === 0 ? (
        <EmptyState
          title="No halls have been configured"
          description="Add the first auditorium, then generate its seating layout."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {halls.map((hall, index) => (
            <motion.article
              key={hall.id}
              className="cb-panel p-5"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : index * 0.04 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-600">Hall {hall.number}</p>
                  <h3 className="mt-1 font-semibold text-zinc-100">{hall.name}</h3>
                </div>
                <StatusBadge status={hall.status} />
              </div>
              <p className="mt-5 text-sm text-zinc-400">{hall.seatCount} {hall.seatCount === 1 ? "seat" : "seats"}</p>
              <Link href={`/admin/locations/${locationId}/halls/${hall.id}`} className="cb-button-secondary mt-5">Manage hall</Link>
            </motion.article>
          ))}
        </div>
      )}

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[var(--cb-border-strong)] bg-[#141417] p-0 text-zinc-100 shadow-2xl backdrop:bg-black/75"
      >
        <motion.form onSubmit={submit} initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="flex items-start justify-between gap-5 border-b border-[var(--cb-border)] px-6 py-5">
            <div><h2 className="text-lg font-semibold">Add hall</h2><p className="mt-1 text-sm text-zinc-500">Create an auditorium with an empty seating layout.</p></div>
            <button type="button" onClick={close} aria-label="Close dialog" className="flex size-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400">×</button>
          </div>
          <fieldset disabled={submitting} className="space-y-4 px-6 py-5">
            <label className="block text-sm font-medium text-zinc-300">Hall name<input name="name" className="cb-field mt-2" placeholder="Grand Hall" required autoFocus /></label>
            <label className="block text-sm font-medium text-zinc-300">Hall number<input name="number" type="number" min={1} max={10000} className="cb-field mt-2" required /></label>
          </fieldset>
          <div className="flex justify-end gap-3 border-t border-[var(--cb-border)] px-6 py-4">
            <button type="button" className="cb-button-secondary" onClick={close} disabled={submitting}>Cancel</button>
            <button type="submit" className="cb-button-primary" disabled={submitting}>{submitting ? "Creating…" : "Create hall"}</button>
          </div>
        </motion.form>
      </dialog>
    </>
  );
}
