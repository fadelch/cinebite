import { stockStatusLabel } from "@/lib/inventory/format";
import type { StockStatus } from "@/types/inventory";

const styles: Record<StockStatus, string> = {
  IN_STOCK: "border-emerald-400/25 bg-emerald-400/8 text-emerald-300",
  LOW_STOCK: "border-amber-400/30 bg-amber-400/8 text-amber-200",
  OUT_OF_STOCK: "border-red-400/30 bg-red-400/8 text-red-200",
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[.68rem] font-semibold uppercase ${styles[status]}`}>{stockStatusLabel[status]}</span>;
}
