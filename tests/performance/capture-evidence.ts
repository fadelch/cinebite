import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import type { Measurement } from "./metrics";
// Type-only import: capture does not load server credentials, fixtures or Prisma.
async function main() {
  const before = JSON.parse(
    await readFile("docs/performance/phase-21-baseline.json", "utf8"),
  );
  const after = JSON.parse(
    await readFile("docs/performance/phase-21-optimized.json", "utf8"),
  );
  assert.ok(after.measurements.every((m: Measurement) => m.status === "PASS"));
  const rows = after.measurements as Measurement[],
    get = (name: string) => {
      const m = rows.find((v) => v.scenario === name);
      assert.ok(m);
      return m;
    };
  const esc = (value: unknown) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const cards = (data: Array<[string, unknown, string]>) =>
    '<div class="cards">' +
    data
      .map(
        ([label, value, note]) =>
          `<section><label>${esc(label)}</label><strong>${esc(value)}</strong><small>${esc(note)}</small></section>`,
      )
      .join("") +
    "</div>";
  const table = (names: string[]) =>
    "<table><thead><tr><th>Workflow</th><th>In flight</th><th>Workflows</th><th>P95 ms</th><th>Unexpected errors</th></tr></thead><tbody>" +
    names
      .map((name) => {
        const m = get(name);
        return `<tr><td>${esc(name)}</td><td>${m.concurrency}</td><td>${m.requests}</td><td>${m.p95Ms}</td><td>${m.unexpectedErrors}</td></tr>`;
      })
      .join("") +
    "</tbody></table>";
  const menuBefore = before.measurements.find(
      (m: Measurement) => m.scenario === "menu-500",
    ),
    menuAfter = get("menu-500"),
    checkout = get("checkout-load"),
    scarce = get("last-stock-100-buyers"),
    refund = get("refund-contention"),
    claim = get("delivery-claim-contention");
  const panels: Array<[string, string, string, string]> = [
    [
      "01-performance-overview.png",
      "Measured capacity, preserved correctness",
      "Production Next build · PostgreSQL 17 · demo Firebase emulators",
      cards([
        [
          "Menu · 500 products",
          menuAfter.p95Ms + " ms",
          "P95, 8 local warm reads",
        ],
        [
          "Stock query work",
          menuAfter.databaseCalls / 8 + " calls/request",
          "Fresh authorized full menu",
        ],
        [
          "Sampled connections",
          after.peakConnections,
          "Application + test runner pools",
        ],
        [
          "Unexpected load errors",
          rows.reduce((n, m) => n + m.unexpectedErrors, 0),
          "Expected 409 / 429 shown separately",
        ],
      ]) +
        table(["menu-load-100-users", "checkout-load", "customer-poll-load"]),
    ],
    [
      "02-load-test-summary.png",
      "Finite bursts, real HTTP workflows",
      "100 menu readers · 100 stock competitors · tenant and location isolation",
      table([
        "menu-load-100-users",
        "cart-load",
        "checkout-load",
        "customer-poll-load",
        "tenant-mixed-load",
        "location-mixed-load",
      ]) +
        cards([
          [
            "Organizations",
            after.dataset.organization,
            "No cross-tenant results",
          ],
          [
            "Initial orders",
            after.dataset.order,
            "6000 synthetic settled records",
          ],
          [
            "Customer sessions",
            after.dataset.customerSession,
            "300 server-bound seat sessions",
          ],
        ]),
    ],
    [
      "03-checkout-load-results.png",
      "Checkout under contention",
      "Exact idempotency keys · bounded retry jitter · no duplicate intents",
      cards([
        ["Distinct orders", checkout.success, "20 customer workflows"],
        [
          "Wire requests",
          checkout.httpRequests,
          "Includes safe transaction retries",
        ],
        [
          "Same-key workflows",
          get("checkout-idempotency").requests,
          "One order and payment attempt",
        ],
        [
          "Checkout P95",
          checkout.p95Ms + " ms",
          "Includes bounded same-key retries",
        ],
      ]) +
        table([
          "checkout-load",
          "checkout-idempotency",
          "last-stock-100-buyers",
        ]),
    ],
    [
      "04-kitchen-performance.png",
      "Kitchen queues and transitions",
      "Fresh permissions on every read · unchanged payload suppression",
      table([
        "kitchen-queue",
        "kitchen-conditional-poll",
        "kitchen-load-accepted",
        "kitchen-load-preparing",
        "kitchen-load-ready",
      ]) +
        cards([
          [
            "Conditional payload",
            get("kitchen-conditional-poll").bytes + " bytes",
            "50 responses · HTTP 304",
          ],
          [
            "Queue SQL work",
            get("kitchen-queue").databaseCalls / 8 + " calls/request",
            "Batched relations, not per order",
          ],
          ["Independent transitions", 60, "20 orders × three guarded steps"],
        ]),
    ],
    [
      "05-database-query-optimization.png",
      "Remove the product stock N+1",
      "Same initial fixture shape · authorization and stock checks stay fresh",
      cards([
        [
          "Before · 500-product menu",
          menuBefore.databaseCalls / 8 + " SQL calls/request",
          "Phase 20 production build",
        ],
        [
          "After · 500-product menu",
          menuAfter.databaseCalls / 8 + " SQL calls/request",
          "Phase 21 production build",
        ],
        ["P95 before", menuBefore.p95Ms + " ms", "8 warm read samples"],
        ["P95 after", menuAfter.p95Ms + " ms", "8 warm read samples"],
      ]) + table(["menu-20", "menu-100", "menu-500"]),
    ],
    [
      "06-concurrency-test-results.png",
      "Safety survives competing writes",
      "Paid-only fulfillment · reserved stock · single delivery assignment",
      cards([
        [
          "Last-stock winners",
          scarce.success + " / " + scarce.requests,
          "Ten available portions, exact winners",
        ],
        [
          "Safe stock conflicts",
          scarce.expectedConflicts,
          "No oversell / duplicate reservations",
        ],
        [
          "Refund outcomes",
          refund.success +
            " success · " +
            refund.expectedConflicts +
            " conflicts",
          "Exposure never exceeds captured amount",
        ],
        [
          "Delivery claim",
          claim.success + " winner",
          "One immutable claim history",
        ],
      ]) +
        table([
          "shared-ingredient",
          "duplicate-webhook-storm",
          "refund-contention",
          "delivery-claim-contention",
        ]),
    ],
    [
      "07-analytics-performance.png",
      "Reporting alongside operations",
      "Separate currencies · correct paid history · bounded CSV export",
      table([
        "analytics-7d",
        "analytics-30d",
        "analytics-max-range",
        "operational-plus-analytics",
        "csv-5000-rows",
      ]) +
        cards([
          ["CSV rows", 5000, "Actual export cap + one header"],
          [
            "CSV response",
            get("csv-5000-rows").bytes + " bytes",
            "Authenticated, formula-safe export",
          ],
          [
            "Mixed load P95",
            get("operational-plus-analytics").p95Ms + " ms",
            "Analytics + queue + checkout",
          ],
        ]),
    ],
  ];
  await mkdir("linkedin/phase-21", { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  try {
    for (const [file, title, subtitle, content] of panels) {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1250 },
        deviceScaleFactor: 1.5,
      });
      await page.route("**/*", (route) => route.abort());
      await page.setContent(
        `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;background:#09090b;color:#fafafa;font-family:Segoe UI,Arial,sans-serif;padding:58px}header{color:#fbbf24;letter-spacing:3px;font-weight:700;font-size:17px}h1{font-size:46px;margin:28px 0 12px}p{font-size:20px;color:#a1a1aa;margin:0 0 32px}.cards{display:flex;gap:16px;margin:24px 0}.cards section{flex:1;padding:23px;border:1px solid #3f3f46;border-radius:18px;background:#18181b;min-width:0}label,small{display:block;color:#a1a1aa}strong{display:block;font-size:30px;line-height:1.35;margin:12px 0;color:#fbbf24}small{font-size:15px;line-height:1.5}table{width:100%;border-collapse:collapse;background:#18181b;border:1px solid #3f3f46;font-size:17px}td,th{padding:17px;text-align:left;border-bottom:1px solid #3f3f46}th{color:#a1a1aa;font-weight:500}footer{font-size:16px;line-height:1.7;color:#a1a1aa;margin-top:28px}.pill{float:right;letter-spacing:0;color:#6ee7b7;background:#052e22;padding:8px 14px;border-radius:30px;font-size:14px}</style></head><body><header>CINEBITE / PHASE 21 <span class="pill">Real results · Synthetic local data</span></header><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${content}<footer>Performance evidence panel · Not a new app dashboard or a production SLA.<br>Finite local cohorts; short-sample P99 is the maximum. Expected business conflicts and wire retries are not hidden.<br>No credentials, customer records, QR codes or private infrastructure shown.</footer></body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: "linkedin/phase-21/" + file,
        fullPage: true,
        animations: "disabled",
      });
      console.log(file);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch(() => {
  console.error(
    "Safe evidence capture failed; verify numeric artifacts first.",
  );
  process.exitCode = 1;
});
