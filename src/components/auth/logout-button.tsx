"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to sign out. Please try again.");
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
      {error ? (
        <p role="alert" className="mt-2 max-w-52 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
