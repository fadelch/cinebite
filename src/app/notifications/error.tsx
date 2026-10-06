"use client";

export default function NotificationError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen bg-zinc-950 p-6">
      <section className="cb-panel mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-xl font-semibold">
          Notifications could not be loaded
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Check your filters or try again. Your orders and payments have not
          changed.
        </p>
        <button
          type="button"
          onClick={reset}
          className="cb-button-secondary mt-5"
        >
          Try again
        </button>
        <a href="/notifications" className="cb-button-secondary ml-3 mt-5">
          Reset filters
        </a>
      </section>
    </main>
  );
}
