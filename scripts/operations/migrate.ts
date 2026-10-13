import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { validateEnvironment } from "../../src/lib/operations/environment";
import { checkMigrationManifest } from "./manifest";
// Caller loads a deliberately selected env file; never discover .env.local here.
const { environment } = validateEnvironment();
checkMigrationManifest();
const sha =
  process.env.OBSERVABILITY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;
if (!process.argv.includes(`--environment=${environment}`))
  throw new Error("Explicit matching migration environment required.");
if (environment === "production") {
  if (
    !sha ||
    !process.argv.includes(`--approve-production=${sha}`) ||
    !process.env.CINEBITE_BACKUP_EVIDENCE_ID
  )
    throw new Error(
      "Production migration requires reviewed SHA and operator-verified backup evidence ID. No backup is inferred.",
    );
}
const r = spawnSync(
  process.execPath,
  [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
  {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exit(r.status ?? 1);
