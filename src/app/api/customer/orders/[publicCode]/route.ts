import { observedRoute } from "@/server/http/observed-route";
import { conditionalJson } from '@/server/http/conditional-json';
import { cookies } from "next/headers";

import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { apiError } from "@/server/http/api-response";
import { getCustomerOrder } from "@/server/services/order.service";

export const runtime = "nodejs";

async function GETHandler(request: Request, { params }: { params: Promise<{ publicCode: string }> }) {
  try {
    return conditionalJson(request, await getCustomerOrder((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, (await params).publicCode));
  } catch (error) { return apiError(error); }
}

export const GET = observedRoute("GET.api.customer.orders.publicCode", GETHandler);
