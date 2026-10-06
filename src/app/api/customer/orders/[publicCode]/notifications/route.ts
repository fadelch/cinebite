import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { getCustomerNotifications } from "@/server/services/notification.service";
import { apiError, apiSuccess } from "@/server/http/api-response";
export async function GET(
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
