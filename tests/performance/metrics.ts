import { prisma } from "@/lib/db/prisma";
let httpRequests = 0;
const httpCodes: Record<string, number> = {};
export function recordHttpRequest() {
  httpRequests++;
}
export function recordHttpResponse(status: number) {
  httpCodes[status] = (httpCodes[status] ?? 0) + 1;
}
export async function databaseSample() {
  const [row] = await prisma.$queryRaw<
    Array<{ calls: bigint; milliseconds: number }>
  >`SELECT COALESCE(sum(calls),0)::bigint AS calls,COALESCE(sum(total_exec_time),0)::float8 AS milliseconds FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT LIKE '%pg_stat_%'`;
  return { calls: Number(row.calls), milliseconds: row.milliseconds };
}
export type Measurement = {
  scenario: string;
  concurrency: number;
  requests: number;
  httpRequests: number;
  httpResponseCodes: Record<string, number>;
  responseCodes: Record<string, number>;
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputRps: number;
  success: number;
  expectedConflicts: number;
  unexpectedErrors: number;
  unexpectedErrorRate: number;
  bytes: number;
  databaseCalls: number;
  databaseMs: number;
  rssDeltaMiB: number;
  status: "PASS" | "FAIL";
};
export async function measure(
  scenario: string,
  concurrency: number,
  requests: number,
  action: (
    i: number,
  ) => Promise<{ status: number; bytes?: number; expected?: boolean }>,
  accept: number[] = [200, 201],
) {
  const before = await databaseSample(),
    httpStart = httpRequests,
    codesStart = { ...httpCodes },
    rss = process.memoryUsage().rss,
    start = performance.now(),
    times: number[] = [],
    responseCodes: Record<string, number> = {};
  let next = 0,
    success = 0,
    expectedConflicts = 0,
    unexpectedErrors = 0,
    bytes = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, requests) }, async () => {
      while (next < requests) {
        const i = next++,
          at = performance.now();
        try {
          const result = await action(i);
          responseCodes[String(result.status)] =
            (responseCodes[String(result.status)] ?? 0) + 1;
          bytes += result.bytes ?? 0;
          if (accept.includes(result.status)) success++;
          else if (result.expected) expectedConflicts++;
          else unexpectedErrors++;
        } catch {
          responseCodes.EXCEPTION = (responseCodes.EXCEPTION ?? 0) + 1;
          unexpectedErrors++;
        }
        times.push(performance.now() - at);
      }
    }),
  );
  const durationMs = performance.now() - start,
    after = await databaseSample();
  times.sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    Math.round(
      times[
        Math.min(times.length - 1, Math.ceil(times.length * fraction) - 1)
      ] * 100,
    ) / 100;
  const result: Measurement = {
    scenario,
    concurrency,
    requests,
    httpRequests: httpRequests - httpStart,
    httpResponseCodes: Object.fromEntries(
      Object.entries(httpCodes)
        .map(([code, count]) => [code, count - (codesStart[code] ?? 0)])
        .filter(([, count]) => Number(count) > 0),
    ),
    responseCodes,
    durationMs: Math.round(durationMs),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    throughputRps: Math.round((requests / durationMs) * 100000) / 100,
    success,
    expectedConflicts,
    unexpectedErrors,
    unexpectedErrorRate: unexpectedErrors / requests,
    bytes,
    databaseCalls: after.calls - before.calls,
    databaseMs:
      Math.round((after.milliseconds - before.milliseconds) * 100) / 100,
    rssDeltaMiB:
      Math.round(((process.memoryUsage().rss - rss) / 1048576) * 100) / 100,
    status: unexpectedErrors ? "FAIL" : "PASS",
  };
  console.log(JSON.stringify(result));
  return result;
}
