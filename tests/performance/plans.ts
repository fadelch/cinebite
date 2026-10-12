import { database, stage } from "./environment";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
async function main() {
  const [db] = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  assert.equal(db.name, database);
  const n = await prisma.notification.findFirstOrThrow({
    where: { type: "LOW_STOCK" },
    select: { recipientUserId: true },
  });
  const l = await prisma.location.findFirstOrThrow({
    where: { slug: { endsWith: "beirut" } },
    select: { id: true },
  });
  const summaries = [];
  for (const [name, statement] of [
    [
      "notification-history",
      () =>
        prisma.$queryRaw<
          Array<{ "QUERY PLAN": Array<Record<string, unknown>> }>
        >`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id,"createdAt" FROM notifications WHERE "recipientUserId"=${n.recipientUserId} AND "expiresAt">now() ORDER BY "createdAt" DESC,id DESC LIMIT 20`,
    ],
    [
      "kitchen-oldest",
      () =>
        prisma.$queryRaw<
          Array<{ "QUERY PLAN": Array<Record<string, unknown>> }>
        >`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM orders WHERE "locationId"=${l.id} AND status='PLACED' ORDER BY "createdAt",id LIMIT 25`,
    ],
    [
      "delivery-ready",
      () =>
        prisma.$queryRaw<
          Array<{ "QUERY PLAN": Array<Record<string, unknown>> }>
        >`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM orders WHERE "locationId"=${l.id} AND status='READY' AND "deliveryAssignedUserId" IS NULL ORDER BY "readyAt",id LIMIT 20`,
    ],
  ] as const) {
    const [row] = await statement(),
      plan = row["QUERY PLAN"][0];
    const nodes: Array<{ type: unknown; index: unknown; rows: unknown }> = [];
    const visit = (value: Record<string, unknown>) => {
      nodes.push({
        type: value["Node Type"],
        index: value["Index Name"] ?? null,
        rows: value["Actual Rows"],
      });
      for (const child of (value.Plans ?? []) as Array<Record<string, unknown>>)
        visit(child);
    };
    visit(plan.Plan as Record<string, unknown>);
    summaries.push({
      name,
      executionMs: plan["Execution Time"],
      planningMs: plan["Planning Time"],
      nodes,
    });
  }
  await mkdir("docs/performance", { recursive: true });
  await writeFile(
    `docs/performance/phase-21-plans-${stage}.json`,
    JSON.stringify(
      {
        scope:
          "Synthetic local EXPLAIN ANALYZE summaries; query text and predicates deliberately omitted",
        summaries,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(summaries));
  await prisma.$disconnect();
}
main().catch(async () => {
  console.error("Local plan review failed.");
  process.exitCode = 1;
  await prisma.$disconnect();
});
