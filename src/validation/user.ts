import { z } from "zod";

import { USER_ROLES } from "@/types/status";
import {
  databaseTimestampSchema,
  documentIdSchema,
} from "@/validation/shared";

export const userProfileDocumentSchema = z
  .object({
    email: z.email().max(254),
    displayName: z.string().trim().min(1).max(120),
    role: z.enum(USER_ROLES),
    organizationId: documentIdSchema.nullable(),
    locationIds: z.array(documentIdSchema).max(100),
    allLocations: z.boolean(),
    active: z.boolean(),
    createdAt: databaseTimestampSchema,
    updatedAt: databaseTimestampSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (new Set(profile.locationIds).size !== profile.locationIds.length) {
      context.addIssue({
        code: "custom",
        message: "Location IDs must be unique.",
        path: ["locationIds"],
      });
    }

    if (profile.role === "SUPER_ADMIN") {
      if (profile.organizationId !== null) {
        context.addIssue({
          code: "custom",
          message: "SUPER_ADMIN cannot belong to an organization.",
          path: ["organizationId"],
        });
      }

      if (profile.allLocations || profile.locationIds.length > 0) {
        context.addIssue({
          code: "custom",
          message: "SUPER_ADMIN cannot have tenant location restrictions.",
          path: ["locationIds"],
        });
      }

      return;
    }

    if (profile.organizationId === null) {
      context.addIssue({
        code: "custom",
        message: "Tenant roles require an organization.",
        path: ["organizationId"],
      });
    }

    if (profile.role === "CINEMA_ADMIN") {
      if (!profile.allLocations) {
        context.addIssue({
          code: "custom",
          message: "CINEMA_ADMIN must have access to all organization locations.",
          path: ["allLocations"],
        });
      }

      if (profile.locationIds.length > 0) {
        context.addIssue({
          code: "custom",
          message: "CINEMA_ADMIN does not use individual location IDs.",
          path: ["locationIds"],
        });
      }

      return;
    }

    if (profile.allLocations) {
      if (profile.locationIds.length > 0) {
        context.addIssue({
          code: "custom",
          message: "All-location access cannot be combined with location IDs.",
          path: ["locationIds"],
        });
      }

      if (profile.role !== "LOCATION_MANAGER") {
        context.addIssue({
          code: "custom",
          message: "This staff role cannot receive organization-wide access.",
          path: ["allLocations"],
        });
      }

      return;
    }

    if (profile.locationIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "This role requires at least one permitted location.",
        path: ["locationIds"],
      });
    }
  });
