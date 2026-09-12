import { LogoutButton } from "@/components/auth/logout-button";
import type { AuthenticatedUser } from "@/types/auth";

interface ProtectedPlaceholderProps {
  title: string;
  description: string;
  user: AuthenticatedUser;
}

export function ProtectedPlaceholder({
  title,
  description,
  user,
}: ProtectedPlaceholderProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-400 uppercase">
              CineBite
            </p>
            <h1 className="mt-5 text-3xl font-semibold text-zinc-100">{title}</h1>
          </div>
          <LogoutButton />
        </div>
        <p className="mt-5 text-zinc-400">{description}</p>
        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 text-sm">
          <p className="text-zinc-300">Signed in as {user.displayName}</p>
          <p className="mt-1 text-zinc-500">Authorized role: {user.role}</p>
        </div>
      </section>
    </main>
  );
}
