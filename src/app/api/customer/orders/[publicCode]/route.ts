import { cookies } from "next/headers";

import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { getCustomerOrder } from "@/server/services/order.service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  try {
    return apiSuccess(await getCustomerOrder((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, (await params).publicCode));
  } catch (error) { return apiError(error); }
}
