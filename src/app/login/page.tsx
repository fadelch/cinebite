import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getLandingPathForRole } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Staff login | CineBite" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  if ("email" in query || "password" in query) {
    redirect("/login");
  }

  const user = await getCurrentUser();

  if (user) {
    redirect(getLandingPathForRole(user.role));
  }

  return (
    <AuthShell
      title="Staff login"
      description="Sign in with your CineBite staff account. Public registration is not available."
      footer={{ label: "Forgot your password?", href: "/forgot-password" }}
    >
      <LoginForm />
    </AuthShell>
  );
}
