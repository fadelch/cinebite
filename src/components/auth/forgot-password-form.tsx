"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import { useState, type FormEvent } from "react";

import { firebaseAuth } from "@/lib/firebase/client";
import { forgotPasswordSchema } from "@/validation/auth";

const GENERIC_RESPONSE =
  "If an account exists for this email, a password reset message has been sent.";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const parsed = forgotPasswordSchema.safeParse({
      email: formData.get("email"),
    });

    if (!parsed.success) {
      setMessage("Enter a valid email address.");
      return;
    }

    setSubmitting(true);

    try {
      await sendPasswordResetEmail(firebaseAuth, parsed.data.email);
    } catch {
      // The response deliberately does not reveal whether an account exists.
    }

    setMessage(GENERIC_RESPONSE);
    setSubmitting(false);
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
      {message ? (
        <p role="status" className="text-sm leading-6 text-zinc-300">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-xl bg-amber-400 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send reset email"}
      </button>
    </form>
  );
}
