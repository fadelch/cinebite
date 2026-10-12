import { observedRoute } from "@/server/http/observed-route";
import { screeningFinancialAction } from "@/server/services/cancellation.service";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { financialPost } from "@/server/http/financial-route";
const POSTHandler = financialPost("screening");
async function GETHandler(_request: Request, ctx: { params: Promise<{ screeningId: string }> }) {
  try { return apiSuccess(await screeningFinancialAction((await ctx.params).screeningId)); } catch (error) { return apiError(error); }
}
export const runtime = "nodejs";

export const GET = observedRoute("GET.api.admin.screenings.screeningId.reconciliation", GETHandler);
export const POST = observedRoute("POST.api.admin.screenings.screeningId.reconciliation", POSTHandler);
