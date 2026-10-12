import { cookies } from "next/headers";
import { optionalSessionData } from "@/server/http/page-failure";
import type { ReactNode } from "react";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { publicBranding } from "@/server/services/organization-settings.service";
import {
  CustomerBrand,
  CustomerSupport,
} from "@/components/customer/customer-brand";
export default async function CustomerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = await optionalSessionData(() => validateCustomerSession(token));
  const brand = session
    ? publicBranding(session.seat.hall.location.organization)
    : null;
  return (
    <div className="min-h-screen bg-[#09090b]">
      {brand ? (
        <div className="px-4 pt-4">
          <CustomerBrand key={brand.logoUrl} branding={brand} />
        </div>
      ) : null}
      {children}
      {brand ? <CustomerSupport branding={brand} /> : null}
    </div>
  );
}
