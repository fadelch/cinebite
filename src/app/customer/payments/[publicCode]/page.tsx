import { cookies } from "next/headers";
import { PaymentClient } from "@/components/customer/payment-client";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { customerPaymentStatus } from "@/server/services/payment.service";
export const metadata = { title: "Secure checkout · CineBite" };
export default async function CustomerPaymentPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const payment = await customerPaymentStatus((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value, (await params).publicCode);
  return <PaymentClient initialPayment={payment} />;
}
