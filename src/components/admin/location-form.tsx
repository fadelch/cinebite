"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { slugify } from "@/lib/super-admin/slug";

export function LocationForm() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const line2 = String(form.get("line2") ?? "").trim();
    const postalCode = String(form.get("postalCode") ?? "").trim();
    const payload = {
      name,
      slug,
      status: "ACTIVE",
      address: {
        line1: String(form.get("line1") ?? ""),
        ...(line2 ? { line2 } : {}),
        ...(postalCode ? { postalCode } : {}),
      },
      city: String(form.get("city") ?? ""),
      country: String(form.get("country") ?? "").toUpperCase(),
      timezone: String(form.get("timezone") ?? ""),
    };

    try {
      const response = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body === "object" && body && "error" in body && typeof body.error === "string"
            ? body.error
            : "The location could not be created.",
        );
      }
      router.push("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The location could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.form
      onSubmit={submit}
      className="cb-panel mt-8 p-5 sm:p-7"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <fieldset disabled={submitting} className="grid gap-5 sm:grid-cols-2">
        <Field label="Location name">
          <input className="cb-field" value={name} onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }} required autoFocus />
        </Field>
        <Field label="Location slug">
          <input className="cb-field font-mono text-sm" value={slug} onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }} required />
        </Field>
        <Field label="Street address"><input name="line1" className="cb-field" required /></Field>
        <Field label="Address line 2"><input name="line2" className="cb-field" /></Field>
        <Field label="City"><input name="city" className="cb-field" required /></Field>
        <Field label="Postal code"><input name="postalCode" className="cb-field" /></Field>
        <Field label="Country code"><input name="country" className="cb-field uppercase" defaultValue="LB" maxLength={2} required /></Field>
        <Field label="Timezone"><input name="timezone" className="cb-field font-mono text-sm" defaultValue="Asia/Beirut" required /></Field>
      </fieldset>
      {error ? <p role="alert" className="mt-5 text-sm text-red-300">{error}</p> : null}
      <div className="mt-7 flex flex-wrap justify-end gap-3">
        <button type="button" className="cb-button-secondary" onClick={() => router.back()} disabled={submitting}>Cancel</button>
        <button type="submit" className="cb-button-primary" disabled={submitting}>{submitting ? "Creating…" : "Create location"}</button>
      </div>
    </motion.form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-zinc-300">{label}<span className="mt-2 block">{children}</span></label>;
}
