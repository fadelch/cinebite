import { z } from "zod";

export const slugSchema = z
  .string()
  .min(3, "Slug must contain at least 3 characters.")
  .max(63, "Slug must contain at most 63 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must use lowercase letters, numbers, and single hyphens only.",
  );

export const documentIdSchema = z
  .string()
  .trim()
  .min(1, "Document ID is required.")
  .max(128, "Document ID is too long.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
    message: "Document ID must be a safe identifier.",
  });

export const databaseTimestampSchema = z.custom<{
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
}>((value) => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const timestamp = value as Record<string, unknown>;

  return (
    typeof timestamp.seconds === "number" &&
    typeof timestamp.nanoseconds === "number" &&
    typeof timestamp.toDate === "function"
  );
}, "Expected a Firestore-compatible timestamp.");
