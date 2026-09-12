import Link from "next/link";
import type { ReactNode } from "react";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: {
    label: string;
    href: string;
  };
}

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl shadow-black/30 sm:p-10">
        <Link
          href="/"
          className="text-sm font-semibold tracking-[0.2em] text-amber-400 uppercase"
        >
          CineBite
        </Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-zinc-100">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
        <div className="mt-8">{children}</div>
        {footer ? (
          <Link
            href={footer.href}
            className="mt-8 block text-center text-sm text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200"
          >
            {footer.label}
          </Link>
        ) : null}
      </section>
    </main>
  );
}
