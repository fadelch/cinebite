import { dispatchCron } from "@/lib/operations/cron";
import { observedRoute } from "@/server/http/observed-route";
import { POST as notifications } from "@/app/api/notifications/process/route";
import { POST as payments } from "@/app/api/payments/expire/route";
import { POST as monitor } from "@/app/api/operations/monitor/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function GETHandler(
  request: Request,
  context: { params: Promise<{ job: string }> },
) {
  const { job } = await context.params;
  const handlers = { notifications, payments, monitor };
  return dispatchCron(request, job, async (request) =>
    handlers[job as keyof typeof handlers](request),
  );
}
export const GET = observedRoute("GET.api.cron.job", GETHandler);
