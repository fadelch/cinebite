import { observedRoute } from "@/server/http/observed-route";
import { financialPost } from "@/server/http/financial-route";
const POSTHandler = financialPost("customer");
export const runtime = "nodejs";

export const POST = observedRoute("POST.api.customer.orders.publicCode.cancel", POSTHandler);
