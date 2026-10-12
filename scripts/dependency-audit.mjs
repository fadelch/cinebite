import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
const reports = [];
const npm = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  process.env.APPDATA + "/npm/node_modules/npm/bin/npm-cli.js",
].find((candidate) => candidate && existsSync(candidate));
if (!npm)
  throw new Error(
    "npm CLI was not found. Run through npm or install npm locally.",
  );
for (const production of [false, true]) {
  const result = spawnSync(
    process.execPath,
    [npm, "audit", "--json", ...(production ? ["--omit=dev"] : [])],
    { encoding: "utf8", windowsHide: true },
  );
  if (!result.stdout?.trim()) throw new Error("Audit did not return a report.");
  const data = JSON.parse(result.stdout);
  if (data.error) throw new Error("Dependency advisory service unavailable.");
  reports.push({
    scope: production ? "production" : "all",
    counts: data.metadata.vulnerabilities,
    findings: Object.values(data.vulnerabilities).map((v) => ({
      name: v.name,
      direct: v.isDirect,
      severity: v.severity,
      range: v.range,
      advisories: v.via
        .filter((a) => typeof a !== "string")
        .map((a) => ({ title: a.title, url: a.url, severity: a.severity })),
      fixAvailable: v.fixAvailable,
    })),
  });
}
mkdirSync("docs/security", { recursive: true });
writeFileSync(
  "docs/security/phase-20-dependency-audit.json",
  JSON.stringify({ recordedAt: new Date().toISOString(), reports }, null, 2) +
    "\n",
);
console.log(
  JSON.stringify(
    reports.map(({ scope, counts, findings }) => ({
      scope,
      counts,
      packages: findings.map((f) => f.name),
    })),
    null,
    2,
  ),
);
