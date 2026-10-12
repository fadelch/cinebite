import { observedRoute } from "@/server/http/observed-route";
import { financialPost } from "@/server/http/financial-route";
const POSTHandler = financialPost("resolve");
export const runtime = "nodejs";

export const POST = observedRoute("POST.api.admin.orders.orderId.issues.resolve", POSTHandler);
