import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/server/auth/current-user";
import { requireScheduleActor } from "./schedule-access.service";
import { ServiceError } from "./service-error";
import { analyticsFilterSchema } from "@/validation/analytics";
import {
  analyticsRows,
  analyticsSummary,
  analyticsTrend,
} from "@/server/repositories/analytics.repository";
import {
  financialMetrics,
  fillDailyBuckets,
  percentage,
  reportRange,
} from "@/lib/analytics/policy";
import { csvDocument } from "@/lib/analytics/csv";
import { isRetryableTransactionError } from "@/lib/db/errors";
import type { AnalyticsData, ReportRow } from "@/types/analytics";

function normalizeReportRow({ key: _key, ...row }: ReportRow): ReportRow {
  void _key;
  for (const field of ["gross", "refunded", "net", "aov"])
    if (row[field] !== undefined && row[field] !== null)
      row[field] = new Prisma.Decimal(String(row[field])).toFixed(2);
  for (const field of ["consumed", "restocked", "waste", "adjustmentOut"])
    if (row[field] !== undefined && row[field] !== null)
      row[field] = new Prisma.Decimal(String(row[field])).toFixed(3);
  return row;
}

export async function getAnalytics(
  input: unknown,
  exportAll = false,
): Promise<AnalyticsData> {
  const actor = requireScheduleActor(await getCurrentUser());
  const filters = analyticsFilterSchema.parse(input);
  // A repeatable snapshot makes financial cards/table agree even while a
  // webhook is settling. No result cache or cross-tenant raw data in the client.
  for (let retry = 0; ; retry++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout = '12000ms'`;
          await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
          const user = await tx.user.findUnique({
            where: { firebaseUid: actor.uid },
            select: { id: true, active: true },
          });
          const membership = user?.active
            ? await tx.organizationMembership.findUnique({
                where: {
                  userId_organizationId: {
                    userId: user.id,
                    organizationId: actor.organizationId,
                  },
                },
                include: { locationAccess: true, organization: true },
              })
            : null;
          if (
            !membership ||
            membership.role !== actor.role ||
            membership.organization.status !== "ACTIVE"
          )
            throw new ServiceError(
              "AUTHORIZATION_DENIED",
              403,
              "Reporting access is not permitted.",
            );
          const permitted =
            membership.role === "CINEMA_ADMIN" || membership.allLocations
              ? undefined
              : membership.locationAccess.map((a) => a.locationId);
          const locations = await tx.location.findMany({
            where: {
              organizationId: actor.organizationId,
              ...(permitted ? { id: { in: permitted } } : {}),
            },
            select: { id: true, name: true, timezone: true },
            orderBy: [{ name: "asc" }, { id: "asc" }],
          });
          const selected = filters.locationId
            ? locations.filter((l) => l.id === filters.locationId)
            : locations;
          if (filters.locationId && !selected.length)
            throw new ServiceError(
              "UNAUTHORIZED_LOCATION",
              403,
              "The selected location is not available to your account.",
            );
          // Single-location boundaries always use its configured timezone. All-
          // location reports explicitly use one selected report zone (Beirut default).
          let range;
          try {
            range = reportRange(
              filters,
              selected.length === 1
                ? selected[0].timezone
                : (filters.timezone ?? "Asia/Beirut"),
            );
          } catch {
            throw new ServiceError(
              "INVALID_DATE_RANGE",
              400,
              "Choose a valid timezone and a range of 1–366 calendar days.",
            );
          }
          const scope = {
            organizationId: actor.organizationId,
            locationIds: selected.map((l) => l.id),
            ...range,
            filters,
          };
          if (exportAll) {
            const key =
              "report:" +
              createHash("sha256")
                .update(
                  actor.uid +
                    ":" +
                    actor.organizationId +
                    ":" +
                    Math.floor(Date.now() / 60000),
                )
                .digest("hex");
            const limits = await tx.$queryRaw<Array<{ count: number }>>(
              Prisma.sql`INSERT INTO report_export_limits (key,count,"expiresAt") VALUES (${key},1,NOW()+INTERVAL '2 minutes') ON CONFLICT (key) DO UPDATE SET count=report_export_limits.count+1 RETURNING count`,
            );
            if (limits[0].count > 6)
              throw new ServiceError(
                "REPORT_RATE_LIMITED",
                429,
                "Please wait a minute before exporting again.",
              );
          }
          // Deliberately sequential on one transactional connection (no pg overlap).
          const summary = await analyticsSummary(tx, scope);
          const report = await analyticsRows(tx, scope, exportAll);
          if (exportAll && report.total > 5000)
            throw new ServiceError(
              "REPORT_TOO_LARGE",
              422,
              "Export is limited to 5,000 rows. Narrow your filters.",
            );
          const trend = await analyticsTrend(tx, scope);
          const screeningOptions = await tx.screening.findMany({
            where: { hall: { locationId: { in: scope.locationIds } } },
            select: {
              id: true,
              startsAt: true,
              movie: { select: { id: true, title: true } },
              hall: {
                select: { name: true, location: { select: { name: true } } },
              },
            },
            orderBy: [{ startsAt: "desc" }, { id: "asc" }],
            take: 200,
          });
          const highlights = [];
          if (!exportAll && filters.report === "overview") {
            for (const [report, title] of [
              ["products", "Top products · gross sales"],
              ["locations", "Location performance"],
              ["operations", "Kitchen & delivery timings"],
            ] as const) {
              const detail = await analyticsRows(
                tx,
                {
                  ...scope,
                  filters: { ...filters, report, page: 1, pageSize: 5 },
                },
                false,
              );
              highlights.push({
                title,
                columns: detail.columns,
                rows: detail.rows.map(normalizeReportRow),
              });
            }
          }
          const statuses = Object.fromEntries(
            summary.counts.map((c) => [c.status, Number(c.count)]),
          );
          const total = Object.values(statuses).reduce((a, b) => a + b, 0),
            canceled = statuses.CANCELED ?? 0,
            delivered = statuses.DELIVERED ?? 0;
          if (exportAll) {
            await tx.auditLog.create({
              data: {
                action: "REPORT_EXPORTED",
                entityType: "ANALYTICS",
                entityId: filters.report,
                organizationId: actor.organizationId,
                actorUserId: user!.id,
                locationId: filters.locationId || null,
                metadata: {
                  report: filters.report,
                  start: range.startDate,
                  end: range.endDate,
                  timezone: range.timezone,
                  rows: report.total,
                },
              },
            });
            await tx.reportExportLimit.deleteMany({
              where: { expiresAt: { lt: new Date() } },
            });
          }
          return {
            report: filters.report,
            filters,
            range: {
              ...range,
              start: range.start.toISOString(),
              end: range.end.toISOString(),
            },
            locations,
            financials: summary.financials.map((f) => ({
              currencyCode: f.currencyCode,
              paidOrders: Number(f.paidOrders),
              ...financialMetrics(
                f.gross.toString(),
                f.refunded.toString(),
                Number(f.paidOrders),
              ),
            })),
            orders: {
              total,
              canceled,
              delivered,
              active: total - canceled - delivered,
              cancellationRate: percentage(canceled, total),
              statuses,
            },
            stock: {
              low: Number(summary.stock.low),
              out: Number(summary.stock.out),
            },
            columns: report.columns,
            rows: report.rows.map(normalizeReportRow),
            totalRows: report.total,
            trend: fillDailyBuckets(trend, range.startDate, range.endDate),
            filterOptions: {
              movies: [
                ...new Map(
                  screeningOptions.map((s) => [
                    s.movie.id,
                    { id: s.movie.id, name: s.movie.title },
                  ]),
                ).values(),
              ],
              screenings: screeningOptions.map((s) => ({
                id: s.id,
                name: `${s.movie.title} · ${s.hall.location.name} · ${s.hall.name} · ${new Intl.DateTimeFormat("en-GB", { timeZone: range.timezone, dateStyle: "short", timeStyle: "short" }).format(s.startsAt)}`,
              })),
            },
            highlights,
            notes: [
              "Financials: captures by Payment.succeededAt; successful refunds by Refund.succeededAt. Net can be negative when older orders are refunded in this period.",
              "Order volume/status and operational durations use orders created in the period; paid-order counts use capture time. Legacy unpaid orders are never financial sales.",
              "Revenue is not profit or ticket revenue. Currencies are separate; no exchange conversion or item-level refund allocation.",
              ...(filters.report === "categories"
                ? [
                    "Category history was not snapshotted. This report groups historical sales by CURRENT category only; recategorization changes attribution.",
                  ]
                : []),
              ...(filters.report === "inventory"
                ? [
                    "Quantities retain each item's unit. Consumption, cancellation restoration, waste and adjustments are separate. Stock alerts are current, not historical. Movie/screening/currency filters exclude unlinked manual movements.",
                  ]
                : []),
              "Entity names use the latest matching sold snapshot; inactive entities remain included. Movie/Hall screening counts mean distinct screenings with attributed orders, not all scheduled screenings.",
            ],
            generatedAt: new Date().toISOString(),
          };
        },
        { isolationLevel: "RepeatableRead", timeout: 20000 },
      );
    } catch (error) {
      if (isRetryableTransactionError(error) && retry < 3) continue;
      if (isRetryableTransactionError(error))
        throw new ServiceError(
          "REPORT_BUSY",
          409,
          "Reporting is busy. Please retry.",
        );
      throw error;
    }
  }
}

export async function exportAnalytics(input: unknown) {
  const data = await getAnalytics(input, true);
  const metadata = [
    data.report,
    data.range.startDate,
    data.range.endDate,
    data.range.timezone,
    data.filters.locationId
      ? data.locations.find((l) => l.id === data.filters.locationId)!.name
      : "All authorized locations",
  ];
  return {
    content: csvDocument(
      [
        "Report",
        "Period start (inclusive)",
        "Period end date (inclusive)",
        "Report timezone",
        "Location scope",
        ...data.columns.map((c) => c.label),
      ],
      data.rows.map((row) => [
        ...metadata,
        ...data.columns.map((c) => row[c.key] ?? null),
      ]),
    ),
    filename: `cinebite-${data.report}-${data.range.startDate}-to-${data.range.endDate}.csv`,
  };
}
