import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/firebase/client", () => ({ firebaseAuth: {} }));
import { LoginForm } from "./login-form";
import { NotificationProvider } from "@/components/ui/notification-provider";

it("keeps credentials out of GET forms and makes Clear a non-submit button", () => {
  const html = renderToStaticMarkup(createElement(NotificationProvider, null, createElement(LoginForm)));
  expect(html).toContain('method="post"');
  expect(html).toMatch(/<button type="button"[^>]*>Clear form<\/button>/);
  expect(html).toContain('type="password"');
});
