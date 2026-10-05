import { cookies } from "next/headers";

import { CartClient } from "@/components/customer/cart-client";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { getCustomerCart } from "@/server/services/cart.service";
import { getCustomerMenu } from "@/server/services/customer-menu.service";

export const metadata = { title: "Your cart | CineBite" };

async function loadCart(token: string | undefined) {
  try { return await getCustomerCart(token); } catch { return null; }
}

export default async function CustomerCartPage() {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const [cart, menu] = await Promise.all([loadCart(token), getCustomerMenu(token).catch(() => null)]);
  return cart
    ? <CartClient initialCart={cart} context={menu ? { movieTitle: menu.movieTitle, hallName: menu.hallName, seatLabel: menu.seatLabel } : null} />
    : <main className="flex min-h-screen items-center justify-center bg-[#09090b] p-4 text-center text-white">Your seat session has ended. Scan the seat QR again.</main>;
}
