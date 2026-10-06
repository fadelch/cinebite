import { screeningFinancialAction } from "@/server/services/cancellation.service";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { financialPost } from "@/server/http/financial-route";
export const POST = financialPost("screening");
export async function GET(_request: Request, ctx: { params: Promise<{ screeningId: string }> }) {
  try { return apiSuccess(await screeningFinancialAction((await ctx.params).screeningId)); } catch (error) { return apiError(error); }
}
export const runtime = "nodejs";
