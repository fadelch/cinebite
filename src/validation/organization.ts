import { z } from "zod";

import { ORGANIZATION_STATUSES } from "@/types/status";
import { databaseTimestampSchema, slugSchema } from "@/validation/shared";

const organizationFields = {
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  status: z.enum(ORGANIZATION_STATUSES),
};

export const createOrganizationSchema = z
  .object({
    ...organizationFields,
    status: organizationFields.status.default("ACTIVE"),
  })
  .strict();

export const updateOrganizationSchema = z
  .object(organizationFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one organization field must be provided.",
  });

export const organizationDocumentSchema = z
  .object({
    ...organizationFields,
    createdAt: databaseTimestampSchema,
    updatedAt: databaseTimestampSchema,
  })
  .strict();

export type CreateOrganizationInput = z.input<
  typeof createOrganizationSchema
>;
export type UpdateOrganizationInput = z.input<
  typeof updateOrganizationSchema
>;
