import { observedRoute } from "@/server/http/observed-route";
import { readiness } from "@/server/observability/health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function GETHandler() {
  const ready = await readiness();
  return Response.json(
    { status: ready ? "ok" : "unavailable" },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = observedRoute("GET.api.ready", GETHandler);
