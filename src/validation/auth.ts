import { z } from "zod";

export const loginSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1).max(256),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.email().max(254),
  })
  .strict();

export const sessionRequestSchema = z
  .object({
    idToken: z.string().min(100).max(10_000),
  })
  .strict();
