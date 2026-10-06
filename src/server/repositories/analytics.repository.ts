import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AnalyticsFilters } from "@/validation/analytics";
import type { ReportColumn, ReportRow } from "@/types/analytics";

export interface ReportScope {
  organizationId: string;
  locationIds: string[];
  start: Date;
  end: Date;
  timezone: string;
  filters: AnalyticsFilters;
}
const q = Prisma.sql;
const num = (expression: string) => Prisma.raw(expression); // private constant expressions only

function base(scope: ReportScope) {
  const { filters: f } = scope;
  return q`WITH o AS (
    SELECT o.*, s."movieId" FROM orders o JOIN screenings s ON s.id=o."screeningId"
    WHERE o."organizationId"=${scope.organizationId}
      AND o."locationId" IN (${Prisma.join(scope.locationIds.length ? scope.locationIds : ["__no_authorized_locations__"])})
      ${f.movieId ? q`AND s."movieId"=${f.movieId}` : Prisma.empty}
      ${f.screeningId ? q`AND o."screeningId"=${f.screeningId}` : Prisma.empty}
      ${f.currencyCode ? q`AND o."currencyCode"=${f.currencyCode}` : Prisma.empty}
  ), c AS (SELECT * FROM o WHERE "createdAt">=(${scope.start}::timestamptz AT TIME ZONE 'UTC') AND "createdAt"<(${scope.end}::timestamptz AT TIME ZONE 'UTC')),
  s AS (SELECT p."orderId", p.amount, p."currencyCode", p."succeededAt" FROM payments p JOIN o ON o.id=p."orderId"
    WHERE p.status='SUCCEEDED' AND o."paymentPolicy"='ONLINE_REQUIRED' AND p."succeededAt">=${scope.start} AND p."succeededAt"<${scope.end}),
  r AS (SELECT r."orderId", SUM(r.amount) amount FROM refunds r JOIN o ON o.id=r."orderId"
    WHERE r.status='SUCCEEDED' AND r."succeededAt">=${scope.start} AND r."succeededAt"<${scope.end} GROUP BY r."orderId"),
  events AS (SELECT e."orderId",
    MAX(e."createdAt") FILTER (WHERE e."toStatus"='PLACED') placed,
    MAX(e."createdAt") FILTER (WHERE e."toStatus"='ACCEPTED') accepted,
    MAX(e."createdAt") FILTER (WHERE e."toStatus"='PREPARING') preparing,
    MAX(e."createdAt") FILTER (WHERE e."toStatus"='READY') ready,
    MAX(e."createdAt") FILTER (WHERE e."toStatus"='OUT_FOR_DELIVERY') departing,
    MAX(e."createdAt") FILTER (WHERE e."toStatus"='DELIVERED') delivered
    FROM order_status_events e JOIN c ON c.id=e."orderId" GROUP BY e."orderId"),
  timings AS (SELECT c.id, c."locationId", c."currencyCode", c.status,
    CASE WHEN c.status<>'CANCELED' AND e.ready>=e.preparing THEN EXTRACT(EPOCH FROM e.ready-e.preparing)/60 END preparation,
    CASE WHEN c.status<>'CANCELED' AND e.accepted>=e.placed THEN EXTRACT(EPOCH FROM e.accepted-e.placed)/60 END acceptance,
    CASE WHEN c.status='DELIVERED' AND e.delivered>=e.departing THEN EXTRACT(EPOCH FROM e.delivered-e.departing)/60 END delivery,
    CASE WHEN c.status='DELIVERED' AND e.delivered>=e.placed THEN EXTRACT(EPOCH FROM e.delivered-e.placed)/60 END fulfillment
    FROM c LEFT JOIN events e ON e."orderId"=c.id)
  `;
}

export async function analyticsSummary(
  tx: Prisma.TransactionClient,
  scope: ReportScope,
) {
  const financials = await tx.$queryRaw<
    Array<{
      currencyCode: string;
      gross: Prisma.Decimal;
      refunded: Prisma.Decimal;
      paidOrders: bigint;
    }>
  >(q`${base(scope)}
    SELECT currency "currencyCode", SUM(gross) gross, SUM(refunded) refunded, SUM(paid)::bigint "paidOrders" FROM (
      SELECT "currencyCode" currency, SUM(amount) gross, 0::numeric refunded, COUNT(*) paid FROM s GROUP BY "currencyCode"
      UNION ALL SELECT o."currencyCode", 0, SUM(r.amount), 0 FROM r JOIN o ON o.id=r."orderId" GROUP BY o."currencyCode"
    ) financial GROUP BY currency ORDER BY currency`);
  const counts = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(
    q`${base(scope)} SELECT status::text status, COUNT(*) count FROM c GROUP BY status`,
  );
  const stock = await tx.$queryRaw<Array<{ low: bigint; out: bigint }>>(q`SELECT
    COUNT(*) FILTER (WHERE "quantityOnHand"-"quantityReserved">0 AND "quantityOnHand"-"quantityReserved"<="lowStockThreshold") low,
    COUNT(*) FILTER (WHERE "quantityOnHand"-"quantityReserved"<=0) out
    FROM location_inventory WHERE "organizationId"=${scope.organizationId}
    AND "locationId" IN (${Prisma.join(scope.locationIds.length ? scope.locationIds : ["__none__"])})`);
  return { financials, counts, stock: stock[0] };
}

export async function analyticsTrend(
  tx: Prisma.TransactionClient,
  scope: ReportScope,
) {
  // Daily buckets of actual records. The service fills missing calendar days
  // with zero only for currencies present in the scoped result.
  return tx.$queryRaw<
    ReportRow[]
  >(q`${base(scope)} SELECT "day", currency, SUM(gross)::text gross, SUM(refunded)::text refunded,
    SUM(paid)::int paid, SUM(canceled)::int canceled, SUM(delivered)::int delivered FROM (
      SELECT TO_CHAR("succeededAt" AT TIME ZONE ${scope.timezone}, 'YYYY-MM-DD') AS "day", "currencyCode" currency,
        SUM(amount) gross, 0::numeric refunded, COUNT(*) paid, 0 canceled, 0 delivered FROM s GROUP BY "day", currency
      UNION ALL SELECT TO_CHAR(x."succeededAt" AT TIME ZONE ${scope.timezone}, 'YYYY-MM-DD'), o."currencyCode", 0, SUM(x.amount),0,0,0
        FROM refunds x JOIN o ON o.id=x."orderId" WHERE x.status='SUCCEEDED' AND x."succeededAt">=${scope.start} AND x."succeededAt"<${scope.end} GROUP BY 1,2
      UNION ALL SELECT TO_CHAR(c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${scope.timezone}, 'YYYY-MM-DD'), c."currencyCode",0,0,0,
        COUNT(*) FILTER (WHERE status='CANCELED'), COUNT(*) FILTER (WHERE status='DELIVERED') FROM c GROUP BY 1,2
    ) buckets GROUP BY "day",currency ORDER BY "day",currency`);
}

const column = (key: string, label: string): ReportColumn => ({ key, label });
const moneyColumns = [
  column("currency", "Currency"),
  column("paidOrders", "Paid orders"),
  column("gross", "Gross food revenue"),
  column("refunded", "Successful refunds"),
  column("net", "Net revenue"),
  column("aov", "AOV"),
];
const timingColumns = [
  column("preparationMean", "Preparation mean (min)"),
  column("preparationMedian", "Preparation median (min)"),
  column("preparationP90", "Preparation P90 (min)"),
  column("preparationSamples", "Preparation samples"),
  column("deliveryMean", "Delivery mean (min)"),
  column("deliveryMedian", "Delivery median (min)"),
  column("deliveryP90", "Delivery P90 (min)"),
  column("deliverySamples", "Delivery samples"),
  column("fulfillmentMean", "Fulfillment mean (min)"),
  column("acceptanceMean", "Acceptance mean (min)"),
  column("excludedPreparation", "Excluded preparation samples"),
  column("excludedDelivery", "Excluded delivery samples"),
];

function timingSql() {
  return q`ROUND(AVG(t.preparation),2)::text "preparationMean", ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY t.preparation))::numeric,2)::text "preparationMedian",
    ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY t.preparation))::numeric,2)::text "preparationP90", COUNT(t.preparation)::int "preparationSamples",
    ROUND(AVG(t.delivery),2)::text "deliveryMean", ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY t.delivery))::numeric,2)::text "deliveryMedian",
    ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY t.delivery))::numeric,2)::text "deliveryP90", COUNT(t.delivery)::int "deliverySamples",
    ROUND(AVG(t.fulfillment),2)::text "fulfillmentMean", ROUND(AVG(t.acceptance),2)::text "acceptanceMean",
    COUNT(*) FILTER (WHERE t.preparation IS NULL)::int "excludedPreparation", COUNT(*) FILTER (WHERE t.delivery IS NULL)::int "excludedDelivery"`;
}

function reportQuery(scope: ReportScope): {
  query: Prisma.Sql;
  columns: ReportColumn[];
} {
  const report = scope.filters.report;
  if (report === "inventory")
    return {
      columns: [
        column("name", "Inventory item"),
        column("location", "Location"),
        column("unit", "Unit"),
        column("consumed", "Order consumption"),
        column("restocked", "Cancellation restoration"),
        column("waste", "Waste"),
        column("adjustmentOut", "Manual adjustment out"),
      ],
      query: q`
    SELECT li.id key, NULL::text currency, i.name, l.name location, i.unit::text unit,
      COALESCE(-SUM(m."quantityDelta") FILTER (WHERE m.type='ORDER_CONSUMPTION'),0)::text consumed,
      COALESCE(SUM(m."quantityDelta") FILTER (WHERE m.type='ORDER_CANCELLATION_RESTOCK'),0)::text restocked,
      COALESCE(-SUM(m."quantityDelta") FILTER (WHERE m.type='WASTE'),0)::text waste,
      COALESCE(-SUM(m."quantityDelta") FILTER (WHERE m.type='ADJUSTMENT_OUT'),0)::text "adjustmentOut"
    FROM inventory_movements m JOIN location_inventory li ON li.id=m."locationInventoryId" JOIN inventory_items i ON i.id=li."inventoryItemId" JOIN locations l ON l.id=li."locationId"
    WHERE m."organizationId"=${scope.organizationId} AND li."locationId" IN (${Prisma.join(scope.locationIds.length ? scope.locationIds : ["__none__"])})
      AND m."createdAt">=(${scope.start}::timestamptz AT TIME ZONE 'UTC') AND m."createdAt"<(${scope.end}::timestamptz AT TIME ZONE 'UTC')
      ${scope.filters.movieId || scope.filters.screeningId || scope.filters.currencyCode ? q`AND m."orderId" IN (SELECT id FROM o)` : Prisma.empty}
    GROUP BY li.id,i.name,l.name,i.unit`,
    };
  if (report === "operations")
    return {
      columns: [column("name", "Location"), ...timingColumns],
      query: q`SELECT t."locationId" key, NULL::text currency,
    (ARRAY_AGG(c."locationNameSnapshot" ORDER BY c."createdAt" DESC,c.id))[1] name, ${timingSql()}
    FROM timings t JOIN c ON c.id=t.id GROUP BY t."locationId"`,
    };
  if (report === "orders")
    return {
      columns: [
        column("name", "Order"),
        column("createdAt", "Placed (UTC)"),
        column("location", "Location snapshot"),
        column("movie", "Movie snapshot"),
        column("status", "Current status"),
        column("currency", "Currency"),
        column("gross", "Captured amount (all-time)"),
      ],
      query: q`
    SELECT c.id key,c."publicOrderCode" name,TO_CHAR(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') "createdAt",
      c."locationNameSnapshot" location,c."movieTitleSnapshot" movie,c.status::text status,c."currencyCode" currency,
      CASE WHEN p.status='SUCCEEDED' AND c."paymentPolicy"='ONLINE_REQUIRED' THEN p.amount ELSE 0 END::text gross
    FROM c LEFT JOIN payments p ON p."orderId"=c.id`,
    };
  if (report === "products" || report === "categories") {
    const category = report === "categories";
    return {
      columns: [
        column(
          "name",
          category
            ? "Current category (not historical)"
            : "Latest sold name snapshot",
        ),
        column("currency", "Currency"),
        column("units", "Units sold"),
        column("gross", "Gross product sales"),
        column("paidOrders", "Orders containing item"),
        column("quantityPerOrder", "Units per containing order"),
      ],
      query: q`
      SELECT ${category ? q`p."categoryId"` : q`i."productId"`} key,
      ${category ? q`MAX(cat.name)` : q`(ARRAY_AGG(i."productNameSnapshot" ORDER BY s."succeededAt" DESC,i.id))[1]`} name,
      s."currencyCode" currency,SUM(i.quantity)::int units,SUM(i."lineTotal")::text gross,COUNT(DISTINCT s."orderId")::int "paidOrders",
      ROUND(SUM(i.quantity)::numeric/NULLIF(COUNT(DISTINCT s."orderId"),0),2)::text "quantityPerOrder"
      FROM s JOIN order_items i ON i."orderId"=s."orderId" JOIN products p ON p.id=i."productId" JOIN menu_categories cat ON cat.id=p."categoryId"
      GROUP BY ${category ? q`p."categoryId"` : q`i."productId"`},s."currencyCode"`,
    };
  }
  // Aggregate charges and refunds separately before any dimensional join. A
  // payment with multiple items/refunds cannot multiply the captured amount.
  const groupKey =
    report === "movies"
      ? q`o."movieId"`
      : report === "screenings"
        ? q`o."screeningId"`
        : report === "halls"
          ? q`o."hallId"`
          : report === "locations"
            ? q`o."locationId"`
            : q`o."currencyCode"`;
  const display =
    report === "movies" || report === "screenings"
      ? q`o."movieTitleSnapshot"`
      : report === "halls"
        ? q`o."hallNameSnapshot"`
        : report === "locations"
          ? q`o."locationNameSnapshot"`
          : q`o."currencyCode"`;
  return {
    columns: [
      ...(report === "revenue" || report === "overview"
        ? []
        : [
            column(
              "name",
              report === "screenings"
                ? "Movie snapshot / screening"
                : "Latest order name snapshot",
            ),
          ]),
      ...moneyColumns,
      ...(report === "screenings"
        ? [
            column("location", "Location"),
            column("hall", "Hall"),
            column("startsAt", "Screening start (UTC)"),
          ]
        : []),
      column("units", "Units sold"),
      column("screenings", "Screenings with orders"),
      column("ordersPerScreening", "Paid orders per attributed screening"),
      column("cohortOrders", "Orders created in period"),
      column("delivered", "Delivered in created cohort"),
      column("canceled", "Canceled in created cohort"),
      ...(report === "locations"
        ? [
            column("preparationMean", "Preparation mean (min)"),
            column("deliveryMean", "Delivery mean (min)"),
          ]
        : []),
    ],
    query: q`
    SELECT ${groupKey} key, (ARRAY_AGG(${display} ORDER BY o."createdAt" DESC,o.id))[1] name, o."currencyCode" currency,
      COUNT(s."orderId")::int "paidOrders", COALESCE(SUM(s.amount),0)::text gross,COALESCE(SUM(r.amount),0)::text refunded,
      (COALESCE(SUM(s.amount),0)-COALESCE(SUM(r.amount),0))::text net,
      COALESCE(ROUND(SUM(s.amount)/NULLIF(COUNT(s."orderId"),0),2),0)::text aov,
      SUM(CASE WHEN s."orderId" IS NOT NULL THEN COALESCE(items.units,0) ELSE 0 END)::int units,
      COUNT(DISTINCT o."screeningId")::int screenings,
      ROUND(COUNT(s."orderId")::numeric/NULLIF(COUNT(DISTINCT o."screeningId"),0),2)::text "ordersPerScreening",
      COUNT(c.id)::int "cohortOrders", COUNT(*) FILTER (WHERE c.status='DELIVERED')::int delivered,COUNT(*) FILTER (WHERE c.status='CANCELED')::int canceled,
      ROUND(AVG(t.preparation),2)::text "preparationMean",ROUND(AVG(t.delivery),2)::text "deliveryMean",
      (ARRAY_AGG(o."locationNameSnapshot" ORDER BY o."createdAt" DESC,o.id))[1] location,
      (ARRAY_AGG(o."hallNameSnapshot" ORDER BY o."createdAt" DESC,o.id))[1] hall,
      TO_CHAR(MAX(o."screeningStartsAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') "startsAt"
    FROM o LEFT JOIN s ON s."orderId"=o.id LEFT JOIN r ON r."orderId"=o.id LEFT JOIN c ON c.id=o.id LEFT JOIN timings t ON t.id=o.id
      LEFT JOIN (SELECT i."orderId", SUM(i.quantity) units FROM order_items i JOIN s ON s."orderId"=i."orderId" GROUP BY i."orderId") items ON items."orderId"=o.id
    WHERE s."orderId" IS NOT NULL OR r."orderId" IS NOT NULL OR c.id IS NOT NULL GROUP BY ${groupKey},o."currencyCode"`,
  };
}

export async function analyticsRows(
  tx: Prisma.TransactionClient,
  scope: ReportScope,
  exportAll = false,
) {
  const { query, columns } = reportQuery(scope);
  const f = scope.filters;
  const numeric = [
    "gross",
    "paidOrders",
    "units",
    "consumed",
    "preparationMean",
  ];
  const supported = columns.some((c) => c.key === f.sort);
  const sort = supported ? f.sort : "name";
  const expression = numeric.includes(sort)
    ? num(`NULLIF(rows."${sort}"::text,'')::numeric`)
    : num(`rows."${sort}"`);
  const direction = f.direction === "asc" ? num("ASC") : num("DESC");
  const limit = exportAll ? 5001 : f.pageSize;
  const offset = exportAll ? 0 : (f.page - 1) * f.pageSize;
  const result = await tx.$queryRaw<
    Array<{ rows: ReportRow[] | null; total: bigint }>
  >(q`${base(scope)}, rows AS (${query}),
    paged AS (SELECT * FROM rows ORDER BY currency ASC NULLS LAST,${expression} ${direction} NULLS LAST,key LIMIT ${limit} OFFSET ${offset})
    SELECT (SELECT json_agg(paged) FROM paged) rows, (SELECT COUNT(*) FROM rows) total`);
  return {
    rows: result[0].rows ?? [],
    total: Number(result[0].total),
    columns,
  };
}
