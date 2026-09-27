import { ScreeningForm } from "@/components/admin/screening-form";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getScreeningWorkspace } from "@/server/services/screening.service";

export const metadata = { title: "Create screening" };

export default async function NewScreeningPage() {
  const workspace = await getScreeningWorkspace();
  return <PageTransition><header><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Cinema schedule</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">Create screening</h1><p className="mt-2 text-sm text-zinc-400">Assign an active movie to an active hall using the location’s authoritative timezone.</p></header>{workspace.locations.length && workspace.movies.length ? <ScreeningForm locations={workspace.locations} movies={workspace.movies} /> : <div className="cb-panel mt-7 p-8 text-sm text-zinc-500">At least one accessible active location with a hall and one active movie are required.</div>}</PageTransition>;
}
