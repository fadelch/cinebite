"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { joinClassNames } from "@/lib/utils";
import type { TenantShellContext } from "@/types/tenant-admin";

const navigation = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/locations", label: "Locations", exact: false },
] as const;

export function AdminShell({
  children,
  context,
}: {
  children: ReactNode;
  context: TenantShellContext;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,185,66,0.055),transparent_34%),var(--background)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-[var(--cb-border)] bg-[#0c0c0f]/95 px-5 py-6 backdrop-blur lg:flex lg:flex-col">
        <AdminBrand organizationName={context.organizationName} />
        <nav aria-label="Cinema Admin navigation" className="mt-10 space-y-1">
          {navigation.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={joinClassNames(
                  "relative flex min-h-11 items-center rounded-xl px-3.5 text-sm font-medium transition-colors",
                  active ? "text-zinc-50" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="cinema-admin-active-nav"
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
          <p className="truncate text-sm font-medium text-zinc-200">{context.user.displayName}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">{context.user.email}</p>
          <p className="mt-2 text-[0.65rem] tracking-[0.14em] text-amber-400/70 uppercase">
            {context.user.role === "CINEMA_ADMIN" ? "Cinema Admin" : "Location Manager"}
          </p>
          <div className="mt-4 text-left [&>div]:text-left"><LogoutButton /></div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-[var(--cb-border)] bg-[#0c0c0f]/92 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <AdminBrand organizationName={context.organizationName} compact />
          <LogoutButton />
        </div>
        <nav aria-label="Cinema Admin mobile navigation" className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {navigation.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={joinClassNames(
                  "whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium",
                  active ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-zinc-800 text-zinc-500",
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

function AdminBrand({ organizationName, compact = false }: { organizationName: string; compact?: boolean }) {
  return (
    <Link href="/admin" className="inline-flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 font-black text-zinc-950">C</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-wide text-zinc-100">CineBite</span>
        <span className="mt-0.5 block truncate text-[0.67rem] tracking-[0.12em] text-zinc-600 uppercase">
          {compact ? organizationName : `${organizationName} · Management`}
        </span>
      </span>
    </Link>
  );
}
