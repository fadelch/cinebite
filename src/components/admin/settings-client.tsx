"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CustomerBrand,
  CustomerSupport,
} from "@/components/customer/customer-brand";
import { useNotifications } from "@/components/ui/notification-provider";
import { BRAND_ACCENTS } from "@/validation/settings";
import type {
  OrganizationSettingsDto,
  LocationSettingsDto,
  PublicBranding,
} from "@/types/settings";
export async function settingsCall<T>(
  url: string,
  data: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "This change could not be saved.");
  return body;
}
function Field({
  label,
  name,
  value,
  type = "text",
  disabled = false,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      {label}
      <input
        className="cb-field mt-2"
        name={name}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        maxLength={type === "email" ? 254 : name === "website" ? 2048 : 160}
      />
    </label>
  );
}
export function OrganizationSettingsClient({
  initial,
}: {
  initial: OrganizationSettingsDto;
}) {
  const [settings, setSettings] = useState(initial),
    [busy, setBusy] = useState(false);
  const toast = useNotifications(),
    reduced = useReducedMotion(),
    disabled = busy || !settings.canEdit;
  const brand: PublicBranding = {
    name: settings.customerFacingName || settings.name,
    logoUrl: settings.logoUrl,
    accent: settings.accent,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    website: settings.website,
  };
  function change(key: keyof OrganizationSettingsDto, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  async function save(event: FormEvent, branding = false) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await settingsCall<OrganizationSettingsDto>(
        branding ? "/api/admin/settings/branding" : "/api/admin/settings",
        branding
          ? { accent: settings.accent, version: settings.version }
          : {
              name: settings.name,
              customerFacingName: settings.customerFacingName,
              supportEmail: settings.supportEmail,
              supportPhone: settings.supportPhone,
              website: settings.website,
              version: settings.version,
            },
      );
      setSettings(saved);
      toast.success(
        branding ? "Branding saved." : "Organization settings saved.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logo(file: File | null) {
    setBusy(true);
    try {
      let saved: OrganizationSettingsDto;
      if (file) {
        const form = new FormData();
        form.set("image", file);
        form.set("version", String(settings.version));
        const response = await fetch("/api/admin/settings/logo", {
          method: "POST",
          body: form,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Logo upload failed.");
        saved = body;
      } else
        saved = await settingsCall(
          "/api/admin/settings/logo",
          { version: settings.version },
          "DELETE",
        );
      setSettings(saved);
      toast.success(
        file
          ? "Logo uploaded safely."
          : "Logo removed; default branding remains available.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-7">
      <header>
        <p className="text-xs tracking-[0.2em] text-amber-400 uppercase">
          Cinema administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Organization settings</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Manage your public cinema profile and safe customer branding. Staff
          credentials remain in Firebase; permissions remain in PostgreSQL.
        </p>
        {!settings.canEdit ? (
          <p className="mt-3 text-sm text-amber-300">
            Read-only: only Cinema Admin can save organization or location
            settings.
          </p>
        ) : null}
      </header>
      <form
        method="post"
        onSubmit={(event) => void save(event)}
        className="cb-panel space-y-5 p-6"
        aria-label="Organization profile"
      >
        <h2 className="text-xl font-semibold">Organization profile</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Administrative name"
            name="name"
            value={settings.name}
            disabled={disabled}
            onChange={(value) => change("name", value)}
          />
          <Field
            label="Customer-facing name (optional)"
            name="customerFacingName"
            value={settings.customerFacingName ?? ""}
            disabled={disabled}
            onChange={(value) => change("customerFacingName", value)}
          />
          <Field
            label="Public cinema support email (optional)"
            name="supportEmail"
            type="email"
            value={settings.supportEmail ?? ""}
            disabled={disabled}
            onChange={(value) => change("supportEmail", value)}
          />
          <Field
            label="Public cinema support phone (optional)"
            name="supportPhone"
            value={settings.supportPhone ?? ""}
            disabled={disabled}
            onChange={(value) => change("supportPhone", value)}
          />
          <Field
            label="Cinema website — HTTPS (optional)"
            name="website"
            type="url"
            value={settings.website ?? ""}
            disabled={disabled}
            onChange={(value) => change("website", value)}
          />
        </div>
        <p className="text-xs leading-5 text-zinc-500">
          The administrative name is separate from the public display name. Use
          cinema contact details, not private employee contacts. Historical
          order snapshots are not rewritten.
        </p>
        <button
          disabled={disabled}
          type="submit"
          className="cb-button-primary min-h-11"
        >
          {busy ? "Saving…" : "Save organization"}
        </button>
      </form>
      <section className="cb-panel p-6" aria-labelledby="branding-settings">
        <h2 id="branding-settings" className="text-xl font-semibold">
          Customer-facing branding
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          JPEG, PNG or WebP; maximum 5 MB. Server decoding normalizes the image;
          SVG, arbitrary HTML/CSS and remote logo URLs are not supported.
        </p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <label className="block text-sm text-zinc-300">
              Cinema logo
              <input
                aria-label="Cinema logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={disabled}
                className="cb-field mt-2"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void logo(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              disabled={disabled || !settings.logoUrl}
              onClick={() => void logo(null)}
              className="cb-button-secondary"
            >
              Remove logo
            </button>
            <form
              method="post"
              onSubmit={(event) => void save(event, true)}
              className="space-y-4"
            >
              <label className="block text-sm text-zinc-300">
                Approved dark-mode accent
                <select
                  className="cb-field mt-2"
                  name="accent"
                  value={settings.accent}
                  disabled={disabled}
                  onChange={(event) => change("accent", event.target.value)}
                >
                  {BRAND_ACCENTS.map((accent) => (
                    <option key={accent} value={accent}>
                      {accent}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={disabled}
                className="cb-button-primary min-h-11"
              >
                Save branding
              </button>
            </form>
          </div>
          <motion.div
            layout={!reduced}
            initial={false}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Safe customer preview
            </p>
            <CustomerBrand key={brand.logoUrl} branding={brand} />
            <div className="mt-5 rounded-xl border border-zinc-800 p-5">
              <h3 className="font-semibold">Your cinema menu</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Choose concessions for your movie and seat. Status and payment
                messages keep the accessible CineBite dark design.
              </p>
              <p className="mt-4 text-amber-300">
                Popcorn · Drinks · Seat delivery
              </p>
            </div>
            <CustomerSupport branding={brand} />
          </motion.div>
        </div>
      </section>
      <section className="cb-panel p-6">
        <h2 className="text-xl font-semibold">Location settings</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Existing location names, addresses and IANA timezones. Payment policy
          and existing inventory/order controls are not duplicated.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {settings.locations.map((location) => (
            <li key={location.id}>
              <Link
                href={`/admin/settings/locations/${location.id}`}
                className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-4 hover:border-amber-400/30"
              >
                <span>{location.name}</span>
                <span className="text-xs text-zinc-500">
                  {location.timezone} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {settings.canEdit ? (
        <section className="cb-panel p-6">
          <h2 className="text-xl font-semibold">Staff & security</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Invite staff, review roles/location access and suspend accounts
            without deleting their historical activity.
          </p>
          <Link href="/admin/staff" className="cb-button-secondary mt-4">
            Manage staff
          </Link>
        </section>
      ) : null}
    </div>
  );
}
export function LocationSettingsClient({
  initial,
}: {
  initial: LocationSettingsDto;
}) {
  const [settings, setSettings] = useState(initial),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const toast = useNotifications();
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { canEdit: _, id, ...data } = settings;
      void _;
      const result = await settingsCall<LocationSettingsDto>(
        `/api/admin/settings/locations/${id}`,
        { ...data, confirmTimezoneChange: confirm },
      );
      setSettings(result);
      setConfirm(false);
      toast.success(
        "Location settings saved. Historical timestamps are unchanged.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/admin/settings" className="text-sm text-amber-300">
        ← Organization settings
      </Link>
      <header>
        <h1 className="text-3xl font-semibold">Location settings</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {settings.name} · Existing operational location
        </p>
      </header>
      <form
        method="post"
        onSubmit={(event) => void save(event)}
        className="cb-panel space-y-5 p-6"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              ["name", "Location name"],
              ["addressLine1", "Address line 1"],
              ["addressLine2", "Address line 2 (optional)"],
              ["postalCode", "Postal code (optional)"],
              ["city", "City"],
              ["country", "Country — two-letter ISO code"],
              ["timezone", "IANA timezone"],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              name={key}
              label={label}
              value={settings[key] ?? ""}
              disabled={busy || !settings.canEdit}
              onChange={(value) => setSettings((s) => ({ ...s, [key]: value }))}
            />
          ))}
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-zinc-300">
          <input
            type="checkbox"
            checked={confirm}
            disabled={busy || !settings.canEdit}
            onChange={(event) => setConfirm(event.target.checked)}
            className="mt-1"
          />
          <span>
            I understand changing timezone affects schedule/report display and
            future date interpretation. Historical UTC timestamps are not
            rewritten.
          </span>
        </label>
        <button
          type="submit"
          disabled={busy || !settings.canEdit}
          className="cb-button-primary min-h-11"
        >
          Save location settings
        </button>
      </form>
    </div>
  );
}
