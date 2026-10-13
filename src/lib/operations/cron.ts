import { timingSafeEqual } from "node:crypto";
import { validateEnvironment } from "./environment";
export const cronJobs = {
  notifications: {
    path: "/api/notifications/process",
    secret: "NOTIFICATION_JOB_SECRET",
  },
  payments: {
    path: "/api/payments/expire",
    secret: "PAYMENT_EXPIRY_JOB_SECRET",
  },
  monitor: {
    path: "/api/operations/monitor",
    secret: "OBSERVABILITY_JOB_SECRET",
  },
} as const;
export type CronJob = keyof typeof cronJobs;
export async function dispatchCron(
  request: Request,
  job: string,
  execute: (request: Request) => Promise<Response>,
) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "",
    expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new Response(null, { status: 401 });
  if (!(job in cronJobs) || !Object.hasOwn(cronJobs, job))
    return new Response(null, { status: 404 });
  try {
    validateEnvironment();
  } catch {
    return new Response(null, { status: 503 });
  }
  if (process.env.CINEBITE_SCHEDULER !== "vercel")
    return new Response(null, { status: 403 });
  const target = cronJobs[job as CronJob];
  // Direct function invocation, not an HTTP proxy. No incoming URL/header is trusted.
  return execute(
    new Request(new URL(target.path, process.env.CINEBITE_APP_ORIGIN), {
      method: "POST",
      headers: { authorization: `Bearer ${process.env[target.secret]}` },
    }),
  );
}
