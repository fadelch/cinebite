"use client";

import { useEffect } from "react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin] Page rendering failed.", { name: error.name, digest: error.digest });
  }, [error]);
  return (
    <div className="cb-panel px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-zinc-100">Cinema management could not be loaded</h1>
      <p className="mt-2 text-sm text-zinc-500">Try the request again. No changes were made.</p>
      <button type="button" className="cb-button-secondary mt-6" onClick={reset}>Try again</button>
    </div>
  );
}
