"use client";
export function RecoveryPanel({
  title,
  error,
  retry,
}: {
  title: string;
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const digest =
    error.digest && /^[a-zA-Z0-9-]{1,100}$/.test(error.digest)
      ? error.digest
      : undefined;
  return (
    <section className="cb-panel mx-auto my-10 max-w-xl space-y-4 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
      <p role="alert" className="text-sm leading-6 text-zinc-400">
        We could not load the current information. Check the existing
        order/payment status before repeating a financial action. No success is
        inferred from this error.
      </p>
      {digest && (
        <p className="break-all font-mono text-xs text-amber-200">
          Reference: {digest}
        </p>
      )}
      <button type="button" onClick={retry} className="cb-button-primary">
        Try again
      </button>
    </section>
  );
}
