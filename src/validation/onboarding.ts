import { z } from "zod";

import { createLocationSchema } from "@/validation/location";
import { createOrganizationSchema } from "@/validation/organization";

export const cinemaAdministratorInputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    email: z.email().max(254).transform((email) => email.toLowerCase()),
  })
  .strict();

export const organizationOnboardingSchema = z
  .object({
    organization: createOrganizationSchema,
    firstLocation: createLocationSchema,
    administrator: cinemaAdministratorInputSchema,
  })
  .strict();

export const organizationStatusChangeSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
  })
  .strict();

export type OrganizationOnboardingInput = z.input<
  typeof organizationOnboardingSchema
>;
export type ValidatedOrganizationOnboardingInput = z.output<
  typeof organizationOnboardingSchema
>;
export type CinemaAdministratorInput = z.output<
  typeof cinemaAdministratorInputSchema
>;
export type OrganizationStatusChangeInput = z.input<
  typeof organizationStatusChangeSchema
>;
