import { validateEnvironment } from "../../src/lib/operations/environment";
import { checkMigrationManifest } from "./manifest";
const { environment } = validateEnvironment();
console.log(
  JSON.stringify({
    environment,
    resourceIsolation: "PASS",
    migrationCount: checkMigrationManifest(),
    secrets: "not displayed",
  }),
);
