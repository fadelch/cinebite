import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { CustomerOrderProgress } from "@/components/customer/order-progress";
import { getCustomerOrder } from "@/server/services/order.service";

export const metadata = { title: "Order confirmed | CineBite" };

export default async function CustomerOrderPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const order = await getCustomerOrder(token, publicCode).catch(() => null);
  if (!order) notFound();
  return <CustomerOrderProgress initialOrder={order} />;
}
