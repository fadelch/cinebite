import { observedRoute } from "@/server/http/observed-route";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { getCustomerNotifications } from "@/server/services/notification.service";
import { apiError, apiSuccess } from "@/server/http/api-response";
async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ publicCode: string }> },
) {
  try {
    return apiSuccess(
      await getCustomerNotifications(
        (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value,
        (await params).publicCode,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export const GET = observedRoute("GET.api.customer.orders.publicCode.notifications", GETHandler);
