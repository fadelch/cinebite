import { notFound } from "next/navigation";

import { MovieEditor } from "@/components/admin/movie-editor";
import { PageTransition } from "@/components/super-admin/page-transition";
import { getMovie } from "@/server/services/movie.service";
import { ServiceError } from "@/server/services/service-error";

export default async function MovieDetailPage({ params }: { params: Promise<{ movieId: string }> }) {
  const { movieId } = await params;
  const detail = await getMovie(movieId).catch((error: unknown) => { if (error instanceof ServiceError && error.code === "MOVIE_NOT_FOUND") notFound(); throw error; });
  return <PageTransition><header><p className="text-xs font-semibold tracking-[.18em] text-amber-400 uppercase">Movie catalog</p><h1 className="mt-2 text-3xl font-semibold text-zinc-50">{detail.movie.title}</h1><p className="mt-2 text-sm text-zinc-400">Metadata, lifecycle status, and secure poster media.</p></header><MovieEditor movie={detail.movie} canEdit={detail.canEdit} /></PageTransition>;
}
