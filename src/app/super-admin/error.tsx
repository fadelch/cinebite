"use client";

import { useEffect } from "react";

export default function SuperAdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Super Admin page failed to render.", { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <section className="cb-panel px-6 py-12 text-center">
      <p className="text-xs font-semibold tracking-[0.16em] text-red-300 uppercase">Unable to load</p>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Super Admin data is temporarily unavailable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">Your session remains protected. Try the request again, or return later if the problem continues.</p>
      <button type="button" onClick={retry} className="cb-button-primary mt-6">Try again</button>
    </section>
  );
}
