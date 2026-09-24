"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ZodIssue } from "zod";

import {
  AdministratorStep,
  LocationStep,
  OrganizationStep,
  ReviewStep,
} from "@/components/super-admin/organization-wizard-steps";
import type {
  OrganizationWizardData,
  WizardErrors,
} from "@/components/super-admin/organization-wizard.types";
import { useNotifications } from "@/components/ui/notification-provider";
import { slugify } from "@/lib/super-admin/slug";
import { createLocationSchema } from "@/validation/location";
import { createOrganizationSchema } from "@/validation/organization";
import {
  cinemaAdministratorInputSchema,
  organizationOnboardingSchema,
} from "@/validation/onboarding";

const STEPS = ["Organization", "First location", "Administrator", "Review"];

const INITIAL_DATA: OrganizationWizardData = {
  organization: { name: "", slug: "", status: "ACTIVE" },
  firstLocation: {
    name: "",
    slug: "",
    status: "ACTIVE",
    address: { line1: "", line2: "", postalCode: "" },
    city: "",
    country: "LB",
    timezone: "Asia/Beirut",
  },
  administrator: { displayName: "", email: "" },
};

interface OnboardingSuccess {
  organizationId: string;
  locationId: string;
  administratorUid: string;
  setupLink: string;
}

export function OrganizationWizard() {
  const reduceMotion = useReducedMotion();
  const notifications = useNotifications();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [data, setData] = useState(INITIAL_DATA);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [organizationSlugEdited, setOrganizationSlugEdited] = useState(false);
  const [locationSlugEdited, setLocationSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<OnboardingSuccess | null>(null);
  const [copied, setCopied] = useState(false);

  const normalizedData = useMemo(
    () => {
      const line2 = data.firstLocation.address.line2?.trim() ?? "";
      const postalCode =
        data.firstLocation.address.postalCode?.trim() ?? "";

      return {
        ...data,
        firstLocation: {
          ...data.firstLocation,
          country: data.firstLocation.country.toUpperCase(),
          address: {
            line1: data.firstLocation.address.line1,
            ...(line2 ? { line2 } : {}),
            ...(postalCode ? { postalCode } : {}),
          },
        },
      };
    },
    [data],
  );

  function issuesToErrors(issues: ZodIssue[]): WizardErrors {
    return Object.fromEntries(
      issues.map((issue) => [issue.path.join("."), issue.message]),
    );
  }

  function validateCurrentStep(): boolean {
    const result =
      step === 0
        ? createOrganizationSchema.safeParse(normalizedData.organization)
        : step === 1
          ? createLocationSchema.safeParse(normalizedData.firstLocation)
          : step === 2
            ? cinemaAdministratorInputSchema.safeParse(
                normalizedData.administrator,
              )
            : organizationOnboardingSchema.safeParse(normalizedData);

    if (!result.success) {
      setErrors(issuesToErrors(result.error.issues));
      return false;
    }

    setErrors({});
    return true;
  }

  function goForward() {
    if (!validateCurrentStep()) {
      return;
    }

    setDirection(1);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    setErrors({});
    setDirection(-1);
    setStep((current) => Math.max(current - 1, 0));
  }

  function updateOrganization(field: "name" | "slug" | "status", value: string) {
    setData((current) => ({
      ...current,
      organization: {
        ...current.organization,
        [field]: value,
        ...(field === "name" && !organizationSlugEdited
          ? { slug: slugify(value) }
          : {}),
      },
    }));

    if (field === "slug") {
      setOrganizationSlugEdited(true);
    }
  }

  function updateLocation(
    field: "name" | "slug" | "status" | "city" | "country" | "timezone",
    value: string,
  ) {
    setData((current) => ({
      ...current,
      firstLocation: {
        ...current.firstLocation,
        [field]: field === "country" ? value.toUpperCase() : value,
        ...(field === "name" && !locationSlugEdited
          ? { slug: slugify(value) }
          : {}),
      },
    }));

    if (field === "slug") {
      setLocationSlugEdited(true);
    }
  }

  async function submit() {
    const result = organizationOnboardingSchema.safeParse(normalizedData);

    if (!result.success) {
      setErrors(issuesToErrors(result.error.issues));
      notifications.error("Please review the onboarding information.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/super-admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "The organization could not be created.";
        throw new Error(message);
      }

      if (
        typeof body !== "object" ||
        body === null ||
        !("organizationId" in body) ||
        !("locationId" in body) ||
        !("administratorUid" in body) ||
        !("setupLink" in body) ||
        typeof body.organizationId !== "string" ||
        typeof body.locationId !== "string" ||
        typeof body.administratorUid !== "string" ||
        typeof body.setupLink !== "string"
      ) {
        throw new Error("The server returned an invalid onboarding result.");
      }

      setSuccess(body as OnboardingSuccess);
      notifications.success("Organization and administrator created successfully.");
    } catch (error) {
      notifications.error(
        error instanceof Error
          ? error.message
          : "The organization could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copySetupLink() {
    if (!success) return;
    await navigator.clipboard.writeText(success.setupLink);
    setCopied(true);
    notifications.success("Setup link copied.");
  }

  if (success) {
    return (
      <motion.section
        className="cb-panel p-6 sm:p-8"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-400/12 text-xl text-emerald-300">
          ✓
        </div>
        <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-emerald-300 uppercase">
          Onboarding complete
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-50">
          Organization and administrator created
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Copy the sensitive password setup link now and provide it securely to
          the cinema administrator. CineBite does not store this link.
        </p>
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
          <p className="text-xs font-semibold tracking-wide text-amber-200 uppercase">
            One-time setup link
          </p>
          <p className="mt-3 break-all font-mono text-xs leading-5 text-zinc-300">
            {success.setupLink}
          </p>
          <button
            type="button"
            onClick={copySetupLink}
            className="cb-button-secondary mt-4"
          >
            {copied ? "Copied" : "Copy setup link"}
          </button>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`/super-admin/organizations/${success.organizationId}`}
            className="cb-button-primary"
          >
            View organization
          </Link>
          <Link
            href="/super-admin/organizations"
            className="cb-button-secondary"
          >
            All organizations
          </Link>
        </div>
      </motion.section>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <ol className="cb-panel h-fit p-3" aria-label="Onboarding progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${
              index === step
                ? "bg-amber-400/10 text-amber-100"
                : index < step
                  ? "text-zinc-300"
                  : "text-zinc-600"
            }`}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                index <= step
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                  : "border-zinc-800"
              }`}
            >
              {index < step ? "✓" : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <div className="cb-panel overflow-hidden">
        <div className="min-h-[34rem] p-6 sm:p-8">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              initial={
                reduceMotion ? false : { opacity: 0, x: direction * 18 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -18 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              {step === 0 ? (
                <OrganizationStep
                  data={data}
                  errors={errors}
                  onChange={updateOrganization}
                />
              ) : null}
              {step === 1 ? (
                <LocationStep
                  data={data}
                  errors={errors}
                  onChange={updateLocation}
                  onAddressChange={(field, value) =>
                    setData((current) => ({
                      ...current,
                      firstLocation: {
                        ...current.firstLocation,
                        address: {
                          ...current.firstLocation.address,
                          [field]: value,
                        },
                      },
                    }))
                  }
                />
              ) : null}
              {step === 2 ? (
                <AdministratorStep
                  data={data}
                  errors={errors}
                  onChange={(field, value) =>
                    setData((current) => ({
                      ...current,
                      administrator: {
                        ...current.administrator,
                        [field]: value,
                      },
                    }))
                  }
                />
              ) : null}
              {step === 3 ? <ReviewStep data={normalizedData} /> : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--cb-border)] bg-zinc-950/35 px-6 py-5 sm:px-8">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 || submitting}
            className="cb-button-secondary"
          >
            Back
          </button>
          <div className="ml-auto text-right">
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goForward}
                className="cb-button-primary"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="cb-button-primary"
              >
                {submitting ? "Creating organization…" : "Create organization"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
