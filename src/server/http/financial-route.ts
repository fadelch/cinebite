import "server-only";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { isSameOriginRequest } from "@/server/auth/request-security";
import { apiError, apiSuccess, forbiddenOrigin, invalidRequestBody } from "./api-response";
import { adminFinancial, adminFinancialAction, cancelCustomerOrder, customerFinancial, reportOrderIssue, screeningFinancialAction } from "@/server/services/cancellation.service";
import { reconciliationSchema } from "@/validation/cancellation";

export function financialGet(customer = false) {
  return async (_request: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const params = await ctx.params;
      const result = customer ? await customerFinancial((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, params.publicCode) : await adminFinancial(params.orderId);
      return apiSuccess(result);
    } catch (error) { return apiError(error); }
  };
}
export function financialPost(operation: "cancel" | "refund" | "retry" | "resolve" | "sandbox" | "customer" | "issue" | "screening") {
  return async (request: Request, ctx: { params: Promise<Record<string, string>> }) => {
    if (!isSameOriginRequest(request)) return forbiddenOrigin();
    let input: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return invalidRequestBody();
      const chunks: Uint8Array[] = []; let length = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 16384) { await reader.cancel(); return invalidRequestBody(); } chunks.push(value); }
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { return invalidRequestBody(); }
    try {
      const params = await ctx.params;
      const result = operation === "customer" ? await cancelCustomerOrder((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, params.publicCode, input)
        : operation === "issue" ? await reportOrderIssue(params.publicCode, input)
        : operation === "screening" ? await screeningFinancialAction(params.screeningId, true, reconciliationSchema.parse(input).batchOrderIds)
        : await adminFinancialAction(params.orderId, operation, input);
      if (result instanceof Response) return result;
      return apiSuccess(result);
    } catch (error) { return apiError(error); }
  };
}
