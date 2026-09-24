"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useNotifications } from "@/components/ui/notification-provider";

export function LogoutButton() {
  const router = useRouter();
  const notifications = useNotifications();
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      notifications.success("Signed out successfully.");
      router.replace("/login");
      router.refresh();
    } catch {
      notifications.error("Unable to sign out. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={logout}
        disabled={submitting}
        className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-60"
      >
        {submitting ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
