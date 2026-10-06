import "server-only";
import { z } from "zod";

/** A missing/invalid job secret disables only processing, never business flows. */
export function notificationJobSecret() {
  const result = z
    .string()
    .regex(/^\S{32,512}$/)
    .safeParse(process.env.NOTIFICATION_JOB_SECRET);
  return result.success ? result.data : null;
}
