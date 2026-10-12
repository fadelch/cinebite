"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import type { operationalSnapshot } from "@/server/observability/operations";
import { OPERATION_VIEWS } from "@/lib/observability/views";
type Snapshot = Awaited<ReturnType<typeof operationalSnapshot>>;
type View = (typeof OPERATION_VIEWS)[number];
function badge(status: string) {
  return (
    <span
      className={
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold " +
        (status === "HEALTHY" || status === "SUCCEEDED" || status === "RESOLVED"
          ? "border-emerald-400/30 text-emerald-300"
          : status === "UNHEALTHY" || status === "FAILED" || status === "OPEN"
            ? "border-red-400/30 text-red-300"
            : "border-amber-400/30 text-amber-200")
      }
    >
      {status}
    </span>
  );
}
function Card({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <section className="cb-panel min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge(status)}
      </div>
      <div className="mt-5 space-y-3 text-sm leading-6 text-zinc-400">
        {children}
      </div>
    </section>
  );
}
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC"
    : "No completed run recorded";
}
export function OperationsDashboard({
  snapshot,
  view,
}: {
  snapshot: Snapshot;
  view: View;
}) {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  const show = (name: View) => view === "overview" || view === name,
    data = snapshot.data;
  const count = (status: string) =>
    data?.webhooks.find((row) => row.status === status)?.count ?? 0;
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 uppercase">
            Reliability & observability
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Platform operations
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Current operational health, not business analytics. Private
            payloads, contacts, credentials and infrastructure addresses are
            excluded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          disabled={pending}
          className="cb-button-secondary"
        >
          {pending ? "Refreshing…" : "Refresh health"}
        </button>
      </header>
      <div
        className="cb-panel flex flex-wrap items-center gap-4 p-5"
        role="status"
      >
        {badge(snapshot.status)}
        <span className="text-sm text-zinc-300">
          Environment: {snapshot.environment}
        </span>
        <span className="text-xs text-zinc-500">
          Checked {date(snapshot.checkedAt)}
        </span>
        <span className="break-all text-xs text-zinc-500">
          Release: {snapshot.release ?? "Not configured"}
        </span>
      </div>
      <nav aria-label="Operational sections" className="flex flex-wrap gap-2">
        {OPERATION_VIEWS.map((name) => (
          <Link
            key={name}
            href={"/super-admin/operations?view=" + name}
            aria-current={name === view ? "page" : undefined}
            className={
              "rounded-xl border px-3 py-2 text-sm capitalize " +
              (name === view
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-zinc-800 text-zinc-400")
            }
          >
            {name}
          </Link>
        ))}
      </nav>
      {!data && (
        <p role="alert" className="cb-panel p-6 text-amber-200">
          Operational records are unavailable. No healthy backlog or business
          success is inferred from missing data.
        </p>
      )}
      <div className={"grid items-start gap-5 " + (view === "overview" ? "xl:grid-cols-2" : "")}>
        {show("database") && (
          <Card title="Database health" status={snapshot.database.status}>
            <p className="text-3xl font-semibold text-zinc-100">
              {snapshot.database.latencyMs === null
                ? "Unavailable"
                : snapshot.database.latencyMs + " ms"}
            </p>
            <p>
              Bounded connectivity probe; no database hostname, SQL or
              connection string.
            </p>
            <p>Last check: {date(snapshot.database.checkedAt)}</p>
          </Card>
        )}
        {show("webhooks") && (
          <Card
            title="Payment webhook monitoring"
            status={
              !data
                ? "UNKNOWN"
                : data.webhooks.some((row) =>
                      ["REJECTED", "REVIEW", "FAILED", "PENDING"].includes(
                        row.status,
                      ),
                    )
                  ? "DEGRADED"
                  : "HEALTHY"
            }
          >
            <p>Persisted verified-event journal · last 15 minutes</p>
            <dl className="grid grid-cols-2 gap-4">
              {[
                [
                  "Recorded",
                  data?.webhooks.reduce((total, row) => total + row.count, 0) ??
                    0,
                ],
                ["Processed", count("PROCESSED")],
                ["Rejected", count("REJECTED")],
                ["Review", count("REVIEW")],
                ["Ignored", count("IGNORED")],
                ["Failed", count("FAILED")],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-zinc-500">{label}</dt>
                  <dd className="text-2xl font-semibold text-zinc-100">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Duplicate deliveries and signature rejections are classified in
              scrubbed request logs; they do not create a competing journal.
            </p>
            <p>
              Cancellation recovery pending:{" "}
              {data?.cancellationPending ?? "Unknown"}
            </p>
          </Card>
        )}
        {show("outbox") && (
          <Card
            title="Notification outbox health"
            status={data?.outbox.status ?? "UNKNOWN"}
          >
            <dl className="grid grid-cols-2 gap-4">
              {[
                ["Pending", data?.outbox.pending ?? "Unknown"],
                [
                  "Oldest pending",
                  data?.outbox.oldestSeconds === null
                    ? "None"
                    : (data?.outbox.oldestSeconds ?? "Unknown") + " sec",
                ],
                ["Retrying", data?.outbox.retrying ?? "Unknown"],
                ["Final failures", data?.outbox.failed ?? "Unknown"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-zinc-500">{label}</dt>
                  <dd className="text-2xl font-semibold text-zinc-100">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Durable Phase 17 retries. A backlog degrades notifications; it
              does not reverse an order, refund or stock transaction.
            </p>
          </Card>
        )}
        {show("refunds") && (
          <Card
            title="Refunds requiring attention"
            status={
              !data
                ? "UNKNOWN"
                : data.refunds.failed || data.refunds.stuck
                  ? "DEGRADED"
                  : "HEALTHY"
            }
          >
            <p>
              <strong className="text-3xl text-zinc-100">
                {data?.refunds.failed ?? "Unknown"}
              </strong>{" "}
              unresolved failed refunds
            </p>
            <p>
              Old pending/processing refunds: {data?.refunds.stuck ?? "Unknown"}
            </p>
            <p>
              Read-only platform view. An authorized cinema supervisor reviews
              the order and retries through its existing financial actions.
            </p>
            {data?.refunds.rows.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-zinc-800 p-3"
              >
                <p className="font-medium text-zinc-100">
                  {row.publicOrderCode}
                </p>
                <p className="break-all text-xs">Refund {row.id}</p>
                <p>
                  {row.status} · {date(row.updatedAt)}
                </p>
              </div>
            ))}
          </Card>
        )}
        {show("jobs") && (
          <Card
            title="Background processor health"
            status={
              !data
                ? "UNKNOWN"
                : data.jobHealth.some((row) => row.status === "DEGRADED")
                  ? "DEGRADED"
                  : data.jobHealth.some((row) => row.status === "UNKNOWN")
                    ? "UNKNOWN"
                    : "HEALTHY"
            }
          >
            {data?.jobHealth.map((job) => (
              <div
                key={job.jobType}
                className="space-y-2 rounded-xl border border-zinc-800 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-zinc-100">
                    {job.jobType.replaceAll("_", " ")}
                  </h3>
                  {badge(job.status)}
                </div>
                <p>Last success: {date(job.lastSuccessAt)}</p>
                <p>Last failure/partial: {date(job.lastFailedAt)}</p>
                <p>
                  Processed {job.processedCount} · Failed/retrying{" "}
                  {job.failedCount} · {job.durationMs ?? "Unknown"} ms
                </p>
              </div>
            ))}
            <p>
              No recorded run means UNKNOWN, not an invented success. This
              dashboard does not provision a scheduler.
            </p>
          </Card>
        )}
        {show("errors") && (
          <Card
            title="Safe incident references"
            status={
              !data
                ? "UNKNOWN"
                : data.incidents.some((row) => row.status === "OPEN")
                  ? "DEGRADED"
                  : "HEALTHY"
            }
          >
            <p>
              Use the request/job reference to locate the corresponding scrubbed
              server logs. No raw exception text or stack trace is stored here.
            </p>
            {!data?.incidents.length && <p>No incidents recorded.</p>}
            {data?.incidents.map((row) => (
              <div
                key={row.id}
                className="space-y-2 rounded-xl border border-zinc-800 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="break-all font-semibold text-zinc-100">
                    {row.errorCode}
                  </h3>
                  {badge(row.status)}
                </div>
                <p className="break-all text-xs">
                  {row.domain} · {date(row.lastSeenAt)}
                </p>
                {row.requestId && (
                  <p className="break-all font-mono text-xs text-amber-200">
                    Reference: {row.requestId}
                  </p>
                )}
                {row.jobRunId && (
                  <p className="break-all font-mono text-xs">{row.jobRunId}</p>
                )}
                <p>Occurrences: {row.occurrences}</p>
              </div>
            ))}
          </Card>
        )}
      </div>
      <section className="cb-panel space-y-3 p-5 text-sm leading-6 text-zinc-400">
        <h2 className="text-lg font-semibold text-zinc-100">
          Operational safety
        </h2>
        <p>
          Liveness checks runtime responsiveness. Readiness checks critical
          configuration and PostgreSQL. External provider reachability is
          UNKNOWN unless separately measured; payment mode is not proof of
          provider health.
        </p>
        <p>
          Monitoring: local structured logging only. No external alert/error
          provider is configured. Existing cinema-scoped refund notifications
          continue through Phase 17.
        </p>
        <p>
          Runbook: docs/operations/README.md. Never manually mark a payment
          successful, delete a webhook journal or blindly issue another charge.
        </p>
      </section>
    </div>
  );
}
