import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset password | CineBite" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset password"
      description="Enter your staff email address. For privacy, CineBite always returns the same response."
      footer={{ label: "Return to staff login", href: "/login" }}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
