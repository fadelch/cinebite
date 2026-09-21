import type { LocationStatus, OrganizationStatus } from "@/types/status";
import { joinClassNames } from "@/lib/utils";

const STATUS_STYLES = {
  ACTIVE: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  SUSPENDED: "border-red-500/25 bg-red-500/10 text-red-300",
  INACTIVE: "border-zinc-600 bg-zinc-800 text-zinc-400",
} as const;

export function StatusBadge({
  status,
}: {
  status: OrganizationStatus | LocationStatus;
}) {
  return (
    <span
      className={joinClassNames(
        "inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.12em] uppercase",
        STATUS_STYLES[status],
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}
