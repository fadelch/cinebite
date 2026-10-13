import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/server/services/customer-session.service", () => ({ validateCustomerSession: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ log: vi.fn() }));
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateCustomerSession } from "@/server/services/customer-session.service";
import { ServiceError } from "@/server/services/service-error";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/customer-session/policy";
import Home from "@/app/page";
import { NotificationProvider } from "@/components/ui/notification-provider";

async function renderHome() {
  return renderToStaticMarkup(createElement(NotificationProvider, null, await Home()));
}

function cookie(value?: string) {
  const get = vi.fn(() => value ? { value } : undefined);
  vi.mocked(cookies).mockResolvedValue({ get } as never);
  return get;
}
beforeEach(() => {
  vi.clearAllMocks(); cookie();
  vi.stubEnv("CINEBITE_ENVIRONMENT", "development"); vi.stubEnv("PAYMENT_PROVIDER", "disabled");
});
afterEach(() => vi.unstubAllEnvs());

it("explains QR ordering without requiring an account, fake seat or database call", async () => {
  const html = await renderHome();
  expect(html).not.toContain("Phase 1");
  expect(html).toContain("Scan your seat QR");
  expect(html).toContain("No customer account or staff login is needed");
  expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Start my order<\/button>/);
  expect(html).toContain('id="seat-qr-entry" hidden=""');
  expect(html).toContain('method="post"');
  expect(html).toContain("Continue to my seat");
  expect(html).toContain('href="/login"');
  expect(validateCustomerSession).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
it.each(["staging", "development"])("clearly labels %s sandbox rather than real checkout", async (environment) => {
  vi.stubEnv("CINEBITE_ENVIRONMENT", environment); vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
  const html = await renderHome();
  expect(html).toContain("No real payments are processed");
  expect(html).toContain(environment === "staging" ? "Staging test environment" : "Sandbox demo");
});
it("resumes only a validated customer session, not a cookie's mere presence", async () => {
  const get = cookie("synthetic-cookie");
  vi.mocked(validateCustomerSession).mockResolvedValue({} as never);
  await expect(Home()).rejects.toThrow("redirect:/customer/menu");
  expect(get).toHaveBeenCalledWith(CUSTOMER_SESSION_COOKIE);
  expect(validateCustomerSession).toHaveBeenCalledWith("synthetic-cookie");
});
it.each(["CUSTOMER_SESSION_INVALID", "CUSTOMER_SESSION_EXPIRED"] as const)("keeps %s on QR guidance", async (code) => {
  cookie("synthetic-cookie");
  vi.mocked(validateCustomerSession).mockRejectedValue(new ServiceError(code, 401, "private diagnostic"));
  const html = await renderHome();
  expect(html).toContain("Your previous seat session has ended");
  expect(html).not.toContain("private diagnostic");
  expect(redirect).not.toHaveBeenCalled();
});
it("keeps the homepage usable on a session dependency failure without leaking details", async () => {
  cookie("synthetic-cookie");
  vi.mocked(validateCustomerSession).mockRejectedValue(new Error("private diagnostic"));
  const html = await renderHome();
  expect(html).toContain("Try your menu again");
  expect(html).not.toContain("private diagnostic");
  expect(redirect).not.toHaveBeenCalled();
});
