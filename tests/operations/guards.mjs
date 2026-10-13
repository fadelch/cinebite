import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { localEnvironment } from "../../scripts/operations/ci-environment.mjs";
const runs = [
  ["seed", "scripts/seed-phase-9-demo.ts", "--confirm-nonproduction"],
  ["load test", "tests/performance/run.ts", "--local"],
  [
    "reset",
    "tests/performance/reset-local.ts",
    "--local",
    "--replace-synthetic-fixtures",
  ],
  ["operations fixtures", "tests/operations/run.ts", "--local"],
  ["legacy payment test", "scripts/verify-phase-14.ts", "--local"],
];
const report = {};
for (const [name, script, ...args] of runs) {
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "--conditions=react-server",
      script,
      ...args,
    ],
    {
      env: { ...localEnvironment(), CINEBITE_ENVIRONMENT: "production" },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(r.error, undefined);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Environment resource isolation validation failed/);
  report[name] = {
    refusedBeforeFixtureWrites: true,
    exitCode: r.status,
    marker: "fake production",
    credentials: "synthetic loopback only",
  };
}
await writeFile(
  ".phase22-test/guard-result.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ status: "PASS", checks: report }));
