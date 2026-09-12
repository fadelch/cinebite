import Link from "next/link";
import { redirect } from "next/navigation";

import { getLandingPathForRole } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function UnauthorizedPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 text-center sm:p-10">
        <p className="text-sm font-semibold tracking-[0.2em] text-amber-400 uppercase">
          CineBite
        </p>
        <h1 className="mt-6 text-3xl font-semibold text-zinc-100">
          Access denied
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          Your account is signed in, but your role does not allow this page.
        </p>
        <Link
          href={getLandingPathForRole(user.role)}
          className="mt-8 inline-flex rounded-xl bg-amber-400 px-5 py-3 font-semibold text-zinc-950"
        >
          Return to your authorized area
        </Link>
      </section>
    </main>
  );
}
