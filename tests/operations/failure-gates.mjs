import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, copyFile, readFile, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { runGate } from "../../scripts/operations/quality.mjs";
import { localEnvironment } from "../../scripts/operations/ci-environment.mjs";
if (
  [
    process.env.CINEBITE_ENVIRONMENT,
    process.env.VERCEL_ENV,
    process.env.OBSERVABILITY_ENVIRONMENT,
  ].includes("production")
)
  throw new Error("Production-marked proof refused.");
const target = ".phase22-test/gate-proof",
  fixture = "tests/operations/fixtures";
await mkdir(target + "/app/app", { recursive: true });
await copyFile(`${fixture}/schema-failure.txt`, `${target}/invalid.prisma`);
await mkdir(target + "/migration/prisma", { recursive: true });
await cp("prisma/migrations", target + "/migration/prisma/migrations", {
  recursive: true,
});
const initial =
  target +
  "/migration/prisma/migrations/20260922160000_initial_postgresql_cutover/migration.sql";
await writeFile(
  initial,
  (await readFile(initial, "utf8")) +
    "\n-- Deliberate isolated checksum drift, not a source edit.\n",
);
for (const [from, to] of [
  ["types-failure", "bad-types.ts"],
  ["test-failure", "failing.test.ts"],
  ["test-config", "vitest.config.mjs"],
  ["build-page", "app/app/page.tsx"],
  ["build-layout", "app/app/layout.tsx"],
  ["build-package", "app/package.json"],
])
  await copyFile(`${fixture}/${from}.txt`, `${target}/${to}`);
const failures = [
  {
    name: "Prisma schema",
    args: [
      "node_modules/prisma/build/index.js",
      "validate",
      "--schema",
      `${target}/invalid.prisma`,
    ],
  },
  {
    name: "migration drift",
    args: [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve("scripts/operations/preflight.ts"),
    ],
    cwd: resolve(`${target}/migration`),
  },
  {
    name: "lint",
    args: [
      "node_modules/eslint/bin/eslint.js",
      "--stdin",
      "--stdin-filename",
      "src/gate-proof.ts",
    ],
    input: await readFile(`${fixture}/lint-failure.txt`, "utf8"),
  },
  {
    name: "types",
    args: [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--skipLibCheck",
      "--target",
      "es2020",
      `${target}/bad-types.ts`,
    ],
  },
  {
    name: "tests",
    args: [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      `${target}/vitest.config.mjs`,
    ],
  },
  {
    name: "build",
    args: [resolve("node_modules/next/dist/bin/next"), "build", "--webpack"],
    cwd: resolve(`${target}/app`),
  },
];
const result = {};
for (const item of failures) {
  let deploymentInvoked = false,
    failureStatus;
  const gate = runGate([item, { name: "deployment" }], (step) => {
    if (step.name === "deployment") {
      deploymentInvoked = true;
      return 0;
    }
    const r = spawnSync(process.execPath, item.args, {
      env: localEnvironment(),
      cwd: item.cwd,
      input: item.input,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(
      r.error,
      undefined,
      "Proof must run the actual tool, not fail to spawn it.",
    );
    failureStatus = r.status;
    return r.status ?? 1;
  });
  assert.notEqual(failureStatus, 0);
  assert.equal(gate.status, 1);
  assert.equal(deploymentInvoked, false);
  result[item.name] = {
    actualFailureExitCode: failureStatus,
    laterDeploymentBlocked: true,
  };
}
await writeFile(
  ".phase22-test/failure-gate-result.json",
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    status: "PASS",
    scope: "intentional invalid fixtures, not application failures",
    failures: result,
  }),
);
