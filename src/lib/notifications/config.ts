import "server-only";
import { z } from "zod";
export function notificationBatchSize(){const value=Number(process.env.NOTIFICATION_BATCH_SIZE);return Number.isInteger(value)&&value>=1&&value<=100?value:25;}

/** A missing/invalid job secret disables only processing, never business flows. */
export function notificationJobSecret() {
  const result = z
    .string()
    .regex(/^\S{32,512}$/)
    .safeParse(process.env.NOTIFICATION_JOB_SECRET);
  return result.success ? result.data : null;
}
