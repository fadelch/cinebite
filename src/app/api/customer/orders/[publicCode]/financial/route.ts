import { observedRoute } from "@/server/http/observed-route";
import { financialGet } from "@/server/http/financial-route";
const GETHandler = financialGet(true);
export const runtime = "nodejs";

export const GET = observedRoute("GET.api.customer.orders.publicCode.financial", GETHandler);
