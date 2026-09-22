"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { slugify } from "@/lib/super-admin/slug";
import type { OrganizationStatus } from "@/types/status";

type DialogName = "location" | "status" | null;

interface OrganizationActionsProps {
  organizationId: string;
  organizationName: string;
  status: OrganizationStatus;
}

export function OrganizationActions({
  organizationId,
  organizationName,
  status,
}: OrganizationActionsProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const dialogReference = useRef<HTMLDialogElement>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [locationSlug, setLocationSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    const element = dialogReference.current;
    if (dialog && element && !element.open) {
      element.showModal();
    }
  }, [dialog]);

  function closeDialog() {
    dialogReference.current?.close();
    setDialog(null);
    setError(null);
  }

  function openDialog(name: Exclude<DialogName, null>) {
    setError(null);
    setSuccess(null);
    setDialog(name);
  }

  async function responseError(response: Response): Promise<string> {
    const body: unknown = await response.json().catch(() => null);
    return typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
      ? body.error
      : "The request could not be completed.";
  }

  async function submitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const line2 = String(formData.get("line2") ?? "").trim();
    const postalCode = String(formData.get("postalCode") ?? "").trim();
    const input = {
      name: locationName,
      slug: locationSlug,
      status: "ACTIVE",
      address: {
        line1: String(formData.get("line1") ?? ""),
        ...(line2 ? { line2 } : {}),
        ...(postalCode ? { postalCode } : {}),
      },
      city: String(formData.get("city") ?? ""),
      country: String(formData.get("country") ?? "").toUpperCase(),
      timezone: String(formData.get("timezone") ?? ""),
    };

    try {
      const response = await fetch(
        `/api/super-admin/organizations/${organizationId}/locations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );

      if (!response.ok) {
        throw new Error(await responseError(response));
      }

      setSuccess("Location added successfully.");
      closeDialog();
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The location could not be added.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus() {
    const nextStatus = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/super-admin/organizations/${organizationId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      if (!response.ok) {
        throw new Error(await responseError(response));
      }

      setSuccess(
        nextStatus === "ACTIVE"
          ? "Organization reactivated."
          : "Organization suspended.",
      );
      closeDialog();
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The status could not be changed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="cb-button-primary"
          onClick={() => openDialog("location")}
          disabled={status !== "ACTIVE"}
          title={
            status === "ACTIVE"
              ? undefined
              : "Reactivate the organization before adding locations."
          }
        >
          Add location
        </button>
        <button
          type="button"
          className={
            status === "ACTIVE" ? "cb-button-danger" : "cb-button-secondary"
          }
          onClick={() => openDialog("status")}
        >
          {status === "ACTIVE" ? "Suspend organization" : "Reactivate"}
        </button>
      </div>
      {success ? (
        <motion.p
          role="status"
          className="mt-3 text-sm text-emerald-300"
          initial={reduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {success}
        </motion.p>
      ) : null}

      <dialog
        ref={dialogReference}
        onClose={() => setDialog(null)}
        onCancel={() => setDialog(null)}
        className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-[var(--cb-border-strong)] bg-[#141417] p-0 text-zinc-100 shadow-2xl backdrop:bg-black/75"
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          {dialog === "location" ? (
            <form onSubmit={submitLocation}>
              <DialogHeader
                title="Add cinema location"
                description={`Create another physical venue for ${organizationName}.`}
                onClose={closeDialog}
              />
              <div className="space-y-4 px-6 py-5">
                <DialogField label="Location name">
                  <input
                    autoFocus
                    className="cb-field"
                    value={locationName}
                    onChange={(event) => {
                      setLocationName(event.target.value);
                      if (!slugEdited) setLocationSlug(slugify(event.target.value));
                    }}
                    required
                  />
                </DialogField>
                <DialogField label="Location slug">
                  <input
                    className="cb-field font-mono text-sm"
                    value={locationSlug}
                    onChange={(event) => {
                      setSlugEdited(true);
                      setLocationSlug(event.target.value);
                    }}
                    required
                  />
                </DialogField>
                <DialogField label="Street address">
                  <input name="line1" className="cb-field" required />
                </DialogField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DialogField label="Address line 2">
                    <input name="line2" className="cb-field" />
                  </DialogField>
                  <DialogField label="Postal code">
                    <input name="postalCode" className="cb-field" />
                  </DialogField>
                  <DialogField label="City">
                    <input name="city" className="cb-field" required />
                  </DialogField>
                  <DialogField label="Country code">
                    <input
                      name="country"
                      className="cb-field uppercase"
                      defaultValue="LB"
                      maxLength={2}
                      required
                    />
                  </DialogField>
                </div>
                <DialogField label="Timezone">
                  <input
                    name="timezone"
                    className="cb-field font-mono text-sm"
                    defaultValue="Asia/Beirut"
                    required
                  />
                </DialogField>
                {error ? (
                  <p role="alert" className="text-sm text-red-300">
                    {error}
                  </p>
                ) : null}
              </div>
              <DialogFooter
                onCancel={closeDialog}
                submitting={submitting}
                submitLabel="Add location"
              />
            </form>
          ) : null}

          {dialog === "status" ? (
            <div>
              <DialogHeader
                title={status === "ACTIVE" ? "Suspend organization" : "Reactivate organization"}
                description={
                  status === "ACTIVE"
                    ? "Tenant users will immediately lose access. Historical data is preserved."
                    : "Tenant users will regain access according to their existing roles and profiles."
                }
                onClose={closeDialog}
              />
              <div className="px-6 py-6">
                <p className="text-sm leading-6 text-zinc-300">
                  Confirm the status change for <strong>{organizationName}</strong>.
                </p>
                {error ? (
                  <p role="alert" className="mt-4 text-sm text-red-300">
                    {error}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-3 border-t border-[var(--cb-border)] px-6 py-4">
                <button
                  type="button"
                  className="cb-button-secondary"
                  onClick={closeDialog}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={
                    status === "ACTIVE"
                      ? "cb-button-danger"
                      : "cb-button-primary"
                  }
                  onClick={changeStatus}
                  disabled={submitting}
                >
                  {submitting
                    ? "Saving…"
                    : status === "ACTIVE"
                      ? "Confirm suspension"
                      : "Confirm reactivation"}
                </button>
              </div>
            </div>
          ) : null}
        </motion.div>
      </dialog>
    </>
  );
}

function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-[var(--cb-border)] px-6 py-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-200"
      >
        ×
      </button>
    </div>
  );
}

function DialogField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-300">
      {label}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function DialogFooter({
  onCancel,
  submitting,
  submitLabel,
}: {
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-[var(--cb-border)] px-6 py-4">
      <button
        type="button"
        className="cb-button-secondary"
        onClick={onCancel}
        disabled={submitting}
      >
        Cancel
      </button>
      <button type="submit" className="cb-button-primary" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}
