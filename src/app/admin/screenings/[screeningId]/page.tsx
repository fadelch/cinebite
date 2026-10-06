import { notFound } from "next/navigation";

import { ScreeningForm } from "@/components/admin/screening-form";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getScreening, getScreeningWorkspace } from "@/server/services/screening.service";
import { ServiceError } from "@/server/services/service-error";
import { ScreeningReconciliation } from "@/components/admin/screening-reconciliation";

export default async function ScreeningDetailPage({ params }: { params: Promise<{ screeningId: string }> }) {
  const { screeningId } = await params;
  const [screening, workspace] = await Promise.all([getScreening(screeningId), getScreeningWorkspace()]).catch((error: unknown) => { if (error instanceof ServiceError && error.code === "SCREENING_NOT_FOUND") notFound(); throw error; });
  return <PageTransition><header><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Screening details</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">{screening.movieTitle}</h1><p className="mt-2 text-sm text-zinc-400">{screening.locationName} · {screening.hallName} · {screening.timezone}</p></header><ScreeningForm locations={workspace.locations} movies={workspace.movies} screening={screening} />{screening.status === "CANCELLED" ? <ScreeningReconciliation screeningId={screeningId} /> : null}</PageTransition>;
}
