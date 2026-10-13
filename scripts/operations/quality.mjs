import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export function runGate(steps, run) {
  for (const step of steps) {
    if (run(step) !== 0) return { status: 1, failed: step.name };
  }
  return { status: 0, failed: null };
}
export const steps = [
  { name: "lint", command: ["node_modules/eslint/bin/eslint.js", "."] },
  {
    name: "route type generation",
    command: ["node_modules/next/dist/bin/next", "typegen"],
  },
  { name: "types", command: ["node_modules/typescript/bin/tsc", "--noEmit"] },
  { name: "tests", command: ["node_modules/vitest/vitest.mjs", "run", "--maxWorkers=2"] },
  {
    name: "prisma validate",
    command: ["node_modules/prisma/build/index.js", "validate"],
  },
  { name: "build", command: ["node_modules/next/dist/bin/next", "build"] },
  { name: "secret scan", command: ["scripts/security-scan.mjs"] },
];
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = runGate(
    steps,
    (step) =>
      spawnSync(process.execPath, step.command, {
        env: process.env,
        stdio: "inherit",
        windowsHide: true,
      }).status ?? 1,
  );
  if (result.failed)
    console.error(
      `Quality gate failed: ${result.failed}. Deployment prohibited.`,
    );
  process.exitCode = result.status;
}
