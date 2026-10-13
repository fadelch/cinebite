import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../../src/lib/operations/migrations.json";
export function checkMigrationManifest() {
  const root = "prisma/migrations";
  const actual = readdirSync(root, { withFileTypes: true })
    .filter((v) => v.isDirectory())
    .map((v) => v.name)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(manifest.map((m) => m.name)))
    throw new Error(
      "Migration manifest needs review and update before release.",
    );
  for (const m of manifest)
    if (
      createHash("sha256")
        .update(
          readFileSync(join(root, m.name, "migration.sql"), "utf8").replace(
            /\r\n/g,
            "\n",
          ),
        )
        .digest("hex") !== m.checksum
    )
      throw new Error(
        "Committed migration checksum drift. Never rewrite an applied migration.",
      );
  return manifest.length;
}
