import { observedRoute } from "@/server/http/observed-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function GETHandler() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = observedRoute("GET.api.health", GETHandler);
