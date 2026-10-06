"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNotifications } from "@/components/ui/notification-provider";
import { REPORTS } from "@/validation/analytics";
import type { AnalyticsData } from "@/types/analytics";

const names = {
  overview: "Overview",
  revenue: "Revenue",
  orders: "Orders",
  products: "Products",
  categories: "Categories",
  locations: "Locations",
  movies: "Movies",
  screenings: "Screenings",
  halls: "Halls",
  operations: "Operations",
  inventory: "Inventory",
};
export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const reduced = useReducedMotion(),
    notifications = useNotifications();
  const [exporting, setExporting] = useState(false),
    exportLock = useRef(false);
  const query = new URLSearchParams(
    Object.entries(data.filters)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  );
  const href = (changes: Record<string, string>) => {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    return "/admin/analytics?" + params;
  };
  async function exportReport() {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    try {
      const response = await fetch("/api/admin/analytics/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.filters),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Report could not be exported.");
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `cinebite-${data.report}-${data.range.startDate}-to-${data.range.endDate}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifications.success(
        "CSV exported with the same authorized filters as this report.",
      );
    } catch (error) {
      notifications.error(
        error instanceof Error
          ? error.message
          : "Export failed. Please try again.",
      );
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }
  return (
    <motion.div
      className="min-w-0 space-y-6"
      initial={{ opacity: reduced ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.15 }}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[.2em] text-amber-400 uppercase">
            Cinema intelligence
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Analytics & reporting</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Real transactions. Clear definitions. Authorized cinema data only.
          </p>
        </div>
        <button
          type="button"
          className="cb-button-primary min-h-11"
          disabled={exporting}
          onClick={exportReport}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </header>
      <nav aria-label="Analytics reports" className="flex flex-wrap gap-2">
        {REPORTS.map((report) => (
          <Link
            className={
              report === data.report
                ? "cb-button-primary min-h-11"
                : "cb-button-secondary min-h-11"
            }
            aria-current={report === data.report ? "page" : undefined}
            key={report}
            href={href({ report, page: "1" })}
          >
            {names[report]}
          </Link>
        ))}
      </nav>
      <section className="cb-panel p-5" aria-label="Report filters">
        <form method="get" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="report" value={data.report} />
          <label className="text-sm">
            Period
            <select
              name="period"
              defaultValue={data.filters.period}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
              <option value="previous-month">Previous month</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          <label className="text-sm">
            Location
            <select
              name="locationId"
              defaultValue={data.filters.locationId ?? ""}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            >
              <option value="">All authorized locations</option>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Report timezone
            <input
              name="timezone"
              defaultValue={data.range.timezone}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
              maxLength={80}
            />
          </label>
          <label className="text-sm">
            Currency (optional)
            <input
              name="currencyCode"
              defaultValue={data.filters.currencyCode ?? ""}
              placeholder="USD or LBP"
              pattern="[A-Z]{3}"
              maxLength={3}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            />
          </label>
          <label className="text-sm">
            Start date (custom)
            <input
              name="start"
              type="date"
              defaultValue={data.range.startDate}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            />
          </label>
          <label className="text-sm">
            End date, inclusive (custom)
            <input
              name="end"
              type="date"
              defaultValue={data.range.endDate}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            />
          </label>
          <label className="text-sm">
            Movie
            <select
              name="movieId"
              defaultValue={data.filters.movieId ?? ""}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            >
              <option value="">All authorized movies</option>
              {data.filters.movieId &&
                !data.filterOptions.movies.some(
                  (movie) => movie.id === data.filters.movieId,
                ) && (
                  <option value={data.filters.movieId}>
                    Selected movie (outside recent list)
                  </option>
                )}
              {data.filterOptions.movies.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Screening
            <select
              name="screeningId"
              defaultValue={data.filters.screeningId ?? ""}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            >
              <option value="">All screenings</option>
              {data.filters.screeningId &&
                !data.filterOptions.screenings.some(
                  (screening) => screening.id === data.filters.screeningId,
                ) && (
                  <option value={data.filters.screeningId}>
                    Selected screening (outside recent list)
                  </option>
                )}
              {data.filterOptions.screenings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Rank / sort
            <select
              name="sort"
              defaultValue={data.filters.sort}
              className="cb-field min-h-11 min-w-0 mt-2 w-full"
            >
              <option value="gross">Gross sales</option>
              <option value="units">Units</option>
              <option value="paidOrders">Paid orders</option>
              <option value="name">Name</option>
              <option value="createdAt">Placed time</option>
              <option value="consumed">Consumption</option>
              <option value="preparationMean">Preparation time</option>
            </select>
          </label>
          <div className="flex items-end gap-3">
            <label className="flex-1 text-sm">
              Direction
              <select
                name="direction"
                defaultValue={data.filters.direction}
                className="cb-field min-h-11 min-w-0 mt-2 w-full"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            <button className="cb-button-primary min-h-11" type="submit">
              Apply
            </button>
          </div>
        </form>
        <p className="mt-4 text-xs text-zinc-400">
          {data.range.startDate} – {data.range.endDate} · {data.range.timezone}{" "}
          · Single-location reports use the location timezone. Multi-location
          reports use this explicit report timezone.
        </p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Created orders"
          value={String(data.orders.total)}
          note="Creation-date cohort"
        />
        <Kpi
          title="Delivered orders"
          value={String(data.orders.delivered)}
          note="Current status of this cohort"
        />
        <Kpi
          title="Active / in flight"
          value={String(data.orders.active)}
          note="Not delivered or canceled"
        />
        <Kpi
          title="Cancellation rate"
          value={
            data.orders.cancellationRate === null
              ? "No data"
              : data.orders.cancellationRate + "%"
          }
          note={`${data.orders.canceled} canceled / ${data.orders.total} created`}
        />
      </div>
      {(["overview", "revenue"].includes(data.report)
        ? data.financials
        : []
      ).map((f) => (
        <section
          key={f.currencyCode}
          className="space-y-3"
          aria-label={`${f.currencyCode} financial metrics`}
        >
          <h2 className="font-semibold text-amber-300">
            {f.currencyCode} · Settlement-period financials
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi
              title="Gross revenue"
              value={f.gross + " " + f.currencyCode}
              note="Successfully captured payments"
            />
            <Kpi
              title="Successful refunds"
              value={f.refunded + " " + f.currencyCode}
              note="Only provider-confirmed success"
            />
            <Kpi
              title="Net revenue"
              value={f.net + " " + f.currencyCode}
              note="Gross minus successful refunds; not profit"
            />
            <Kpi
              title="Paid orders"
              value={String(f.paidOrders)}
              note="Unique canonical captures, not attempts"
            />
            <Kpi
              title="Average order value"
              value={f.aov + " " + f.currencyCode}
              note="Gross / paid orders"
            />
            <Kpi
              title="Revenue refund rate"
              value={
                f.revenueRefundRate === null
                  ? "No captured revenue"
                  : f.revenueRefundRate + "%"
              }
              note="Period successful refunds / period gross"
            />
          </div>
        </section>
      ))}
      {!data.financials.length && !data.orders.total ? (
        <section className="cb-panel p-8 text-center">
          <h2 className="text-xl font-semibold">No data for this period</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Try a different date range or an authorized location. No sample
            metrics are substituted.
          </p>
        </section>
      ) : null}
      {(data.report === "overview" || data.report === "revenue") &&
        data.financials.map((f) => {
          const points = data.trend
            .filter((t) => t.currency === f.currencyCode)
            .map((t) => ({
              day: String(t.day),
              gross: Number(t.gross),
              refunded: Number(t.refunded),
            }));
          return (
            <section key={f.currencyCode} className="cb-panel min-w-0 p-5">
              <h2 className="text-lg font-semibold">
                Revenue trend · {f.currencyCode}
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Daily settlements in {data.range.timezone}; chart values are
                visual approximations. Exact amounts are in CSV and tables.
              </p>
              <div
                className="mt-5 h-64 min-w-0"
                role="img"
                aria-label={`Daily captured revenue and successful refunds, ${f.currencyCode}`}
              >
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={points}>
                    <CartesianGrid stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "#a1a1aa", fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: "#a1a1aa", fontSize: 11 }}
                      width={65}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        borderColor: "#3f3f46",
                      }}
                    />
                    <Legend />
                    <Line
                      type="linear"
                      dataKey="gross"
                      name="Captured revenue"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="refunded"
                      name="Successful refunds"
                      stroke="#34d399"
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer">
                  Accessible daily values
                </summary>
                {points.map((p) => (
                  <p key={String(p.day)}>
                    {p.day}: gross {p.gross}, refunds {p.refunded}{" "}
                    {f.currencyCode}
                  </p>
                ))}
              </details>
            </section>
          );
        })}
      {(data.report === "overview" || data.report === "orders") &&
      data.orders.total ? (
        <section className="cb-panel p-5">
          <h2 className="text-lg font-semibold">Order status distribution</h2>
          <div
            className="mt-5 h-64"
            role="img"
            aria-label="Current status counts for orders created in the selected period"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={Object.entries(data.orders.statuses).map(
                  ([status, count]) => ({ status, count }),
                )}
              >
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="status"
                  tick={{ fill: "#a1a1aa", fontSize: 9 }}
                />
                <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa" }} />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    borderColor: "#3f3f46",
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Created-cohort orders"
                  fill="#fbbf24"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            {Object.entries(data.orders.statuses)
              .map(([status, count]) => `${status}: ${count}`)
              .join(" · ")}
          </p>
        </section>
      ) : null}
      {(["overview", "orders"].includes(data.report)
        ? [...new Set(data.trend.map((t) => String(t.currency)))]
        : []
      ).map((currency) => (
        <section key={currency} className="cb-panel p-5">
          <h2 className="text-lg font-semibold">
            Orders over time · {currency}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Paid by settlement day; canceled/delivered by creation day and
            current status.
          </p>
          <div
            className="mt-5 h-64"
            role="img"
            aria-label={`Daily paid, canceled and delivered order counts in ${currency}`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={data.trend.filter((t) => t.currency === currency)}
              >
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    borderColor: "#3f3f46",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="paid"
                  name="Paid"
                  fill="#fbbf24"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="canceled"
                  name="Canceled"
                  fill="#fb7185"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="delivered"
                  name="Delivered"
                  fill="#34d399"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer">
              Accessible daily counts
            </summary>
            {data.trend
              .filter((t) => t.currency === currency)
              .map((t) => (
                <p key={String(t.day)}>
                  {t.day}: paid {t.paid}, canceled {t.canceled}, delivered{" "}
                  {t.delivered}
                </p>
              ))}
          </details>
        </section>
      ))}
      {data.highlights.map((group) => (
        <section key={group.title} className="cb-panel p-5">
          <h2 className="text-lg font-semibold">{group.title}</h2>
          <p className="mt-2 text-xs text-zinc-400">
            {group.title.includes("timings")
              ? "Only valid completed event pairs count. Durations are in minutes."
              : "Currency groups are separate; ranking is within each currency."}
          </p>
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{group.title}</caption>
              <thead>
                <tr>
                  {group.columns.slice(0, 6).map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className="border-b border-zinc-800 px-3 py-3 whitespace-nowrap text-zinc-400"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => (
                  <tr key={i}>
                    {group.columns.slice(0, 6).map((c) => (
                      <td
                        key={c.key}
                        className="border-b border-zinc-800/50 px-3 py-3 whitespace-nowrap"
                      >
                        {row[c.key] ?? "No completed sample"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!group.rows.length ? (
              <p className="py-4 text-zinc-400">No data for this period.</p>
            ) : null}
          </div>
        </section>
      ))}
      {data.report === "inventory" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Kpi
            title="Currently low stock"
            value={String(data.stock.low)}
            note="Available = on hand − reserved; > 0 and ≤ threshold"
          />
          <Kpi
            title="Currently out of stock"
            value={String(data.stock.out)}
            note="Available ≤ 0; current authorized locations"
          />
        </div>
      ) : null}
      {data.report === "operations"
        ? data.rows.map((row, i) => (
            <section key={i} className="cb-panel p-5">
              <h2 className="text-lg font-semibold">
                {row.name} · Completed operational samples
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  title="Preparation mean"
                  value={
                    row.preparationMean === null
                      ? "No sample"
                      : `${row.preparationMean} min`
                  }
                  note={`${row.preparationSamples} valid completed pairs`}
                />
                <Kpi
                  title="Delivery mean"
                  value={
                    row.deliveryMean === null
                      ? "No sample"
                      : `${row.deliveryMean} min`
                  }
                  note={`${row.deliverySamples} valid completed pairs`}
                />
                <Kpi
                  title="Total fulfillment"
                  value={
                    row.fulfillmentMean === null
                      ? "No sample"
                      : `${row.fulfillmentMean} min`
                  }
                  note="PLACED → DELIVERED event pairs"
                />
                <Kpi
                  title="Acceptance wait"
                  value={
                    row.acceptanceMean === null
                      ? "No sample"
                      : `${row.acceptanceMean} min`
                  }
                  note="PLACED → ACCEPTED event pairs"
                />
              </div>
            </section>
          ))
        : null}
      <section
        className="cb-panel overflow-hidden p-5"
        aria-label={`${names[data.report]} report table`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{names[data.report]} report</h2>
          <span className="text-xs text-zinc-400">
            {data.totalRows} rows · Page {data.filters.page}
          </span>
        </div>
        {data.rows.length ? (
          <div className="mt-5 max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {names[data.report]} · {data.range.startDate} through{" "}
                {data.range.endDate} · {data.range.timezone}
              </caption>
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th
                      scope="col"
                      className="border-b border-zinc-800 px-3 py-3 whitespace-nowrap font-medium text-zinc-400"
                      key={c.key}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {data.columns.map((c) => (
                      <td
                        key={c.key}
                        className="border-b border-zinc-800/50 px-3 py-4 whitespace-nowrap"
                      >
                        {row[c.key] === null
                          ? "No completed sample"
                          : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 text-sm text-zinc-400">
            No report rows for this period.
          </p>
        )}
        <nav
          aria-label="Report pagination"
          className="mt-5 flex flex-wrap items-center justify-between gap-3"
        >
          {data.filters.page > 1 ? (
            <Link
              className="cb-button-secondary min-h-11"
              href={href({ page: String(data.filters.page - 1) })}
            >
              Previous page
            </Link>
          ) : (
            <span />
          )}
          {data.filters.page * data.filters.pageSize < data.totalRows ? (
            <Link
              className="cb-button-secondary min-h-11"
              href={href({ page: String(data.filters.page + 1) })}
            >
              Next page
            </Link>
          ) : null}
        </nav>
      </section>
      <details className="cb-panel p-5 text-sm">
        <summary className="cursor-pointer font-semibold">
          Metric definitions & limitations
        </summary>
        <ul className="mt-4 list-disc space-y-3 pl-5 text-zinc-400">
          {data.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-zinc-500">
          Generated {data.generatedAt}. No comparison or contractual SLA is
          claimed.
        </p>
      </details>
    </motion.div>
  );
}
function Kpi({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="cb-panel min-w-0 p-5">
      <p className="text-xs font-medium text-zinc-400">{title}</p>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-zinc-100">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{note}</p>
    </div>
  );
}
