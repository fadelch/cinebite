"use client";

import {
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { isRoleLandingPath } from "@/lib/auth/authorization";
import { firebaseAuth } from "@/lib/firebase/client";
import { loginSchema } from "@/validation/auth";

const GENERIC_AUTH_ERROR = "Invalid email or password.";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      setError(GENERIC_AUTH_ERROR);
      return;
    }

    setSubmitting(true);

    try {
      await setPersistence(firebaseAuth, inMemoryPersistence);
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        parsed.data.email,
        parsed.data.password,
      );
      const idToken = await credential.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Session creation failed.");
      }

      const data: unknown = await response.json();

      if (
        typeof data !== "object" ||
        data === null ||
        !("landingPath" in data) ||
        !isRoleLandingPath(data.landingPath)
      ) {
        throw new Error("Invalid session response.");
      }

      await signOut(firebaseAuth);
      router.replace(data.landingPath);
      router.refresh();
    } catch {
      await signOut(firebaseAuth).catch(() => undefined);
      setError(GENERIC_AUTH_ERROR);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm text-zinc-300">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500"
          placeholder="staff@example.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-zinc-300">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-xl bg-amber-400 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
