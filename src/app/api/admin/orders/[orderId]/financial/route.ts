import { observedRoute } from "@/server/http/observed-route";
import { financialGet } from "@/server/http/financial-route";
const GETHandler = financialGet();
export const runtime = "nodejs";

export const GET = observedRoute("GET.api.admin.orders.orderId.financial", GETHandler);
