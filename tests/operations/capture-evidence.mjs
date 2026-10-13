import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
const recovery = JSON.parse(
  await readFile(".phase22-test/recovery-result.json", "utf8"),
);
const browserRun = JSON.parse(
  await readFile(".phase22-test/browser-result.json", "utf8"),
);
if (recovery.status !== "PASS" || browserRun.status !== "PASS")
  throw new Error("No successful evidence to capture.");
await mkdir("linkedin/phase-22", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.OPS_CHROME_PATH ||
    (process.platform === "win32"
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : "/usr/bin/google-chrome"),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  const escape = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  for (const [filename, title, cards, rows] of [
    [
      "06-isolated-backup-restore.png",
      "Encrypted backup · isolated recovery",
      [
        ["Migrations applied", recovery.migrations.count],
        ["Tables verified", recovery.restore.tableCount],
        ["Restore duration", `${recovery.restore.durationMs} ms`],
      ],
      [
        ["Synthetic pg_dump + AES-256-GCM", recovery.backup.status],
        [
          "Exact restored row digests",
          recovery.restore.rowDigestsMatch ? "PASS" : "FAIL",
        ],
        ["Financial constraints", recovery.restore.financialGuards],
        ["Tenant foreign keys", recovery.restore.foreignKeys],
        [
          "Failed transaction leaves no DDL",
          recovery.restore.failedMigrationRolledBack ? "PASS" : "FAIL",
        ],
        ["Hosted Neon backup / PITR", "NOT EXECUTABLE"],
      ],
    ],
    [
      "07-local-release-rollback.png",
      "Release smoke · rollback · redeployment",
      [
        ["Authenticated release smoke", browserRun.releaseSmoke],
        ["Local app rollback", browserRun.rollback.status],
        ["Candidate redeployment", browserRun.redeploy],
      ],
      [
        ["Same database, no schema downgrade", "PASS"],
        [
          "Previous known-good commit",
          browserRun.rollback.previousCommit.slice(0, 12),
        ],
        [
          "Database outage blocks promotion",
          browserRun.unavailableDatabaseBlocksSmoke,
        ],
        ["Job authentication / monitoring", browserRun.jobMonitoring],
        ["Mobile sandbox checkout", browserRun.mobileSandboxCheckout],
        ["Hosted Vercel rollback", "NOT EXECUTABLE"],
      ],
    ],
  ]) {
    await page.setContent(
      `<!doctype html><html><head><style>body{margin:0;background:#090a0d;color:#f3f4f6;font:22px system-ui}main{padding:70px;max-width:1300px;margin:auto}.eyebrow{color:#ffc400;letter-spacing:4px;font-size:18px}h1{font-size:52px;line-height:1.2;margin:25px 0}.notice{color:#bcc1cc;line-height:1.6}.cards{display:flex;gap:25px;margin:42px 0}.card{flex:1;padding:30px;border:1px solid #353841;border-radius:20px;background:#15171d}.card span{display:block;color:#a4adbb;font-size:19px}.card strong{display:block;margin-top:18px;color:#68dfb7;font-size:38px}table{width:100%;border-collapse:collapse}td{padding:19px;border-bottom:1px solid #30343d}td:last-child{text-align:right;color:#d8e2f4}footer{margin-top:45px;color:#9098a5;font-size:18px}</style></head><body><main><div class="eyebrow">CINEBITE · PHASE 22</div><h1>${escape(title)}</h1><p class="notice">Actual isolated local test evidence — not a hosted provider dashboard.<br>Only synthetic data. No production deployment or production recovery.</p><div class="cards">${cards.map(([name, value]) => `<div class="card"><span>${escape(name)}</span><strong>${escape(value)}</strong></div>`).join("")}</div><table>${rows.map(([name, value]) => `<tr><td>${escape(name)}</td><td>${escape(value)}</td></tr>`).join("")}</table><footer>Production launch: NO-GO until hosted staging and real payment verification are complete.</footer></main></body></html>`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "linkedin/phase-22/" + filename,
      fullPage: true,
    });
  }
} finally {
  await browser.close();
}
