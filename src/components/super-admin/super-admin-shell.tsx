"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { joinClassNames } from "@/lib/utils";

const navigation = [
  { href: "/super-admin", label: "Overview", exact: true },
  {
    href: "/super-admin/organizations",
    label: "Organizations",
    exact: false,
  },
] as const;

interface SuperAdminShellProps {
  children: ReactNode;
  user: { displayName: string; email: string };
}

export function SuperAdminShell({ children, user }: SuperAdminShellProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,185,66,0.06),transparent_32%),var(--background)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-[var(--cb-border)] bg-[#0c0c0f]/95 px-5 py-6 backdrop-blur lg:flex lg:flex-col">
        <Brand />
        <nav aria-label="Super Admin navigation" className="mt-10 space-y-1">
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={joinClassNames(
                  "relative flex min-h-11 items-center rounded-xl px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "text-zinc-50"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="super-admin-active-nav"
                    className="absolute inset-0 rounded-xl border border-amber-400/15 bg-amber-400/8"
                    transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  />
                ) : null}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-[var(--cb-border)] pt-5">
          <p className="truncate text-sm font-medium text-zinc-200">
            {user.displayName}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-500">{user.email}</p>
          <div className="mt-4 text-left [&>div]:text-left">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-[var(--cb-border)] bg-[#0c0c0f]/92 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <Brand compact />
          <LogoutButton />
        </div>
        <nav
          aria-label="Super Admin mobile navigation"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={joinClassNames(
                  "whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium",
                  active
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                    : "border-zinc-800 text-zinc-500",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="px-4 py-6 sm:px-6 sm:py-8 lg:ml-72 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/super-admin" className="inline-flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-amber-400 font-black tracking-tight text-zinc-950">
        C
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-wide text-zinc-100">
          CineBite
        </span>
        {!compact ? (
          <span className="mt-0.5 block text-[0.67rem] tracking-[0.15em] text-zinc-600 uppercase">
            Platform control
          </span>
        ) : null}
      </span>
    </Link>
  );
}
