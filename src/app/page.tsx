import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SeatQrEntry } from "@/components/customer/seat-qr-entry";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import { log } from "@/lib/observability/logger";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { isServiceError } from "@/server/services/service-error";

export const metadata = {
  title: "Order from your seat | CineBite",
  description: "Scan your cinema seat QR code to order snacks and drinks with CineBite.",
};

export default async function Home() {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  let activeSession = false;
  let sessionEnded = false;
  let resumeUnavailable = false;
  if (token) {
    try {
      await validateCustomerSession(token);
      activeSession = true;
    } catch (error) {
      if (isServiceError(error) && error.status === 401) sessionEnded = true;
      else {
        resumeUnavailable = true;
        log("warn", "home.session_unavailable", { errorCode: "CUSTOMER_SESSION_UNAVAILABLE" });
      }
    }
  }
  // Never infer a cinema or seat from an unverified cookie, URL or demo fixture.
  if (activeSession) redirect("/customer/menu");
  const staging = process.env.CINEBITE_ENVIRONMENT === "staging";
  const sandbox = process.env.PAYMENT_PROVIDER === "sandbox";
  const steps = [
    { title: "Scan your seat QR", detail: "Use your phone camera to scan the QR code on your cinema seat. The code identifies your cinema, hall and seat." },
    { title: "Check in and confirm", detail: "Ask staff to check your ticket and give you a one-time code. Confirm your seat and movie, enter that code, then browse your cinema’s snacks and drinks." },
    { title: "Order and relax", detail: "Complete checkout and follow your order while the cinema team prepares it and delivers it to your seat." },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,185,66,0.08),transparent_45%),#09090b] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 font-semibold text-zinc-100" aria-label="CineBite home">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-400 text-xl font-black text-zinc-950" aria-hidden="true">C</span>
            CineBite
          </Link>
          <Link href="/login" className="cb-button-secondary">Staff login</Link>
        </header>
        {staging || sandbox ? (
          <aside aria-label="Test environment" className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-200">
            <span className="font-semibold">{staging ? "Staging test environment" : "Sandbox demo"}</span>
            {" · "}No real payments are processed. Use test accounts and test orders only.
          </aside>
        ) : null}
        <div className="grid gap-8 py-12 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-12">
          <section aria-labelledby="home-title">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Order from your seat</p>
            <h1 id="home-title" className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-5xl">Your movie.<br />Your snacks.<br /><span className="text-amber-300">Delivered to your seat.</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-zinc-400">Scan the QR code at your seat to start ordering. No customer account or staff login is needed.</p>
            <SeatQrEntry />
            <p className="mt-4 text-sm leading-6 text-zinc-500">Ordering is available during a live screening. Your seat QR is at the cinema—not on this homepage.</p>
            {sessionEnded ? <p role="status" className="mt-5 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-300">Your previous seat session has ended. Scan your seat QR again during a live screening.</p> : null}
            {resumeUnavailable ? <p role="status" className="mt-5 text-sm leading-6 text-zinc-300">We couldn’t reconnect to your seat right now. <Link href="/customer/menu" className="text-amber-300 underline">Try your menu again</Link> or ask the cinema team for help.</p> : null}
          </section>
          <section id="how-to-order" aria-labelledby="how-to-order-title" className="scroll-mt-6 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/20 sm:p-8">
            <h2 id="how-to-order-title" className="text-xl font-semibold text-zinc-100">From seat to snacks in three steps</h2>
            <ol className="mt-7 space-y-7">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-sm font-bold text-amber-300" aria-hidden="true">{index + 1}</span>
                  <div><h3 className="font-semibold text-zinc-100">{step.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{step.detail}</p></div>
                </li>
              ))}
            </ol>
            <p className="mt-8 border-t border-zinc-800 pt-5 text-sm leading-6 text-zinc-500">Can’t find or scan the QR? Ask a cinema team member for your seat’s ordering code.</p>
          </section>
        </div>
        <footer className="border-t border-zinc-800 py-5 text-center text-xs leading-6 text-zinc-500">CineBite · Cinema food delivered directly to your seat.</footer>
      </div>
    </main>
  );
}
