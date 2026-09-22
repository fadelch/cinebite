import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { href: string; label: string };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="cb-panel flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-lg text-amber-300">
        CB
      </div>
      <h2 className="mt-5 text-lg font-semibold text-zinc-100">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
        {description}
      </p>
      {action ? (
        <Link href={action.href} className="cb-button-primary mt-6">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
