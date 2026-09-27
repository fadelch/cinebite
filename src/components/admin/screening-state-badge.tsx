import type { ScreeningTemporalState } from "@/lib/screenings/temporal-state";

const styles: Record<ScreeningTemporalState, string> = {
  LIVE: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  UPCOMING: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  ENDED: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
  CANCELLED: "border-red-400/25 bg-red-400/8 text-red-300",
};

const labels: Record<ScreeningTemporalState, string> = { LIVE: "Live now", UPCOMING: "Upcoming", ENDED: "Ended", CANCELLED: "Cancelled" };

export function ScreeningStateBadge({ state }: { state: ScreeningTemporalState }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[.65rem] font-semibold tracking-wide uppercase ${styles[state]}`}>{labels[state]}</span>;
}
