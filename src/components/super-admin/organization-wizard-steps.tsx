import type { ReactNode } from "react";

import type {
  OrganizationWizardData,
  WizardErrors,
} from "@/components/super-admin/organization-wizard.types";
import { StatusBadge } from "@/components/super-admin/status-badge";

interface StepProps {
  data: OrganizationWizardData;
  errors: WizardErrors;
}

export function OrganizationStep({
  data,
  errors,
  onChange,
}: StepProps & {
  onChange: (field: "name" | "slug" | "status", value: string) => void;
}) {
  return (
    <StepSection
      eyebrow="Step 1"
      title="Organization identity"
      description="Create the tenant boundary customers and staff will belong to."
    >
      <Field label="Organization name" error={errors.name}>
        <input
          className="cb-field"
          value={data.organization.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="Empire Cinemas"
          autoComplete="organization"
          required
        />
      </Field>
      <Field
        label="Organization slug"
        hint="Lowercase URL-safe identifier. You can edit the suggestion."
        error={errors.slug}
      >
        <input
          className="cb-field font-mono text-sm"
          value={data.organization.slug}
          onChange={(event) => onChange("slug", event.target.value)}
          placeholder="empire-cinemas"
          spellCheck={false}
          required
        />
      </Field>
      <Field label="Initial status" error={errors.status}>
        <select
          className="cb-field"
          value={data.organization.status}
          onChange={(event) => onChange("status", event.target.value)}
        >
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </Field>
    </StepSection>
  );
}

export function LocationStep({
  data,
  errors,
  onChange,
  onAddressChange,
}: StepProps & {
  onChange: (
    field: "name" | "slug" | "status" | "city" | "country" | "timezone",
    value: string,
  ) => void;
  onAddressChange: (
    field: "line1" | "line2" | "postalCode",
    value: string,
  ) => void;
}) {
  return (
    <StepSection
      eyebrow="Step 2"
      title="First cinema location"
      description="Add the first physical venue. More locations can be added later."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Location name" error={errors.name}>
          <input
            className="cb-field"
            value={data.firstLocation.name}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="Downtown Beirut"
            required
          />
        </Field>
        <Field label="Location slug" error={errors.slug}>
          <input
            className="cb-field font-mono text-sm"
            value={data.firstLocation.slug}
            onChange={(event) => onChange("slug", event.target.value)}
            placeholder="downtown-beirut"
            spellCheck={false}
            required
          />
        </Field>
      </div>
      <Field label="Street address" error={errors["address.line1"]}>
        <input
          className="cb-field"
          value={data.firstLocation.address.line1}
          onChange={(event) => onAddressChange("line1", event.target.value)}
          placeholder="123 Cinema Avenue"
          autoComplete="address-line1"
          required
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Address line 2" error={errors["address.line2"]}>
          <input
            className="cb-field"
            value={data.firstLocation.address.line2 ?? ""}
            onChange={(event) => onAddressChange("line2", event.target.value)}
            placeholder="Optional"
            autoComplete="address-line2"
          />
        </Field>
        <Field label="Postal code" error={errors["address.postalCode"]}>
          <input
            className="cb-field"
            value={data.firstLocation.address.postalCode ?? ""}
            onChange={(event) =>
              onAddressChange("postalCode", event.target.value)
            }
            placeholder="Optional"
            autoComplete="postal-code"
          />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="City" error={errors.city}>
          <input
            className="cb-field"
            value={data.firstLocation.city}
            onChange={(event) => onChange("city", event.target.value)}
            autoComplete="address-level2"
            required
          />
        </Field>
        <Field
          label="Country code"
          hint="Two-letter ISO code"
          error={errors.country}
        >
          <input
            className="cb-field uppercase"
            value={data.firstLocation.country}
            onChange={(event) => onChange("country", event.target.value)}
            maxLength={2}
            autoComplete="country"
            required
          />
        </Field>
        <Field label="Status" error={errors.status}>
          <select
            className="cb-field"
            value={data.firstLocation.status}
            onChange={(event) => onChange("status", event.target.value)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>
      </div>
      <Field
        label="Timezone"
        hint="Use an IANA timezone such as Europe/Paris or Asia/Beirut."
        error={errors.timezone}
      >
        <input
          className="cb-field font-mono text-sm"
          value={data.firstLocation.timezone}
          onChange={(event) => onChange("timezone", event.target.value)}
          required
        />
      </Field>
    </StepSection>
  );
}

export function AdministratorStep({
  data,
  errors,
  onChange,
}: StepProps & {
  onChange: (field: "displayName" | "email", value: string) => void;
}) {
  return (
    <StepSection
      eyebrow="Step 3"
      title="Cinema administrator"
      description="CineBite creates the account and a secure password setup link. No password is handled here."
    >
      <Field label="Administrator name" error={errors.displayName}>
        <input
          className="cb-field"
          value={data.administrator.displayName}
          onChange={(event) => onChange("displayName", event.target.value)}
          placeholder="Maya Haddad"
          autoComplete="name"
          required
        />
      </Field>
      <Field label="Administrator email" error={errors.email}>
        <input
          className="cb-field"
          value={data.administrator.email}
          onChange={(event) => onChange("email", event.target.value)}
          placeholder="admin@cinema.example"
          type="email"
          autoComplete="email"
          required
        />
      </Field>
      <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.06] p-4 text-sm leading-6 text-sky-100/80">
        Role and organization claims are assigned by the trusted server. The
        administrator will choose their own password from the one-time setup
        link shown after onboarding.
      </div>
    </StepSection>
  );
}

export function ReviewStep({ data }: Pick<StepProps, "data">) {
  return (
    <StepSection
      eyebrow="Step 4"
      title="Review onboarding"
      description="Confirm the tenant boundary, venue, and administrator before creating records."
    >
      <ReviewBlock title="Organization">
        <ReviewRow label="Name" value={data.organization.name} />
        <ReviewRow label="Slug" value={data.organization.slug} mono />
        <ReviewRow
          label="Status"
          value={<StatusBadge status={data.organization.status} />}
        />
      </ReviewBlock>
      <ReviewBlock title="First location">
        <ReviewRow label="Name" value={data.firstLocation.name} />
        <ReviewRow label="Slug" value={data.firstLocation.slug} mono />
        <ReviewRow
          label="Address"
          value={`${data.firstLocation.address.line1}, ${data.firstLocation.city}, ${data.firstLocation.country}`}
        />
        <ReviewRow label="Timezone" value={data.firstLocation.timezone} mono />
      </ReviewBlock>
      <ReviewBlock title="Cinema administrator">
        <ReviewRow label="Name" value={data.administrator.displayName} />
        <ReviewRow label="Email" value={data.administrator.email} />
        <ReviewRow label="Role" value="CINEMA_ADMIN" mono />
      </ReviewBlock>
    </StepSection>
  );
}

function StepSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="text-xs font-semibold tracking-[0.16em] text-amber-400 uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-50">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
        {description}
      </p>
      <div className="mt-7 space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      {hint ? (
        <span className="ml-2 text-xs font-normal text-zinc-600">{hint}</span>
      ) : null}
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span className="mt-1.5 block text-xs text-red-300">{error}</span>
      ) : null}
    </label>
  );
}

function ReviewBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cb-border)] bg-zinc-950/45 p-5">
      <h3 className="font-medium text-zinc-200">{title}</h3>
      <dl className="mt-4 space-y-3">{children}</dl>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={mono ? "font-mono text-zinc-300" : "text-zinc-300"}>
        {value}
      </dd>
    </div>
  );
}
