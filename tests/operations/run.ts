import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";
import {
  assertNonProductionToolEnvironment,
  assertSafeFixtureTarget,
} from "../../src/lib/operations/environment";
import { localEnvironment } from "../../scripts/operations/ci-environment.mjs";
import { checkMigrationManifest } from "../../scripts/operations/manifest";
import { prisma } from "@/lib/db/prisma";
import { migrationReadiness } from "@/server/observability/release";
import { operationFixtures } from "./fixtures";

assertNonProductionToolEnvironment();
if (!process.argv.includes("--local"))
  throw new Error("Operations drill requires --local; never load .env.local.");
Object.assign(process.env, localEnvironment());
assertSafeFixtureTarget();
const connection = { host: "127.0.0.1", port: 55414, user: "cinebite_test" };
const source = "cinebite_phase22_test",
  recovery = `cinebite_phase22${Date.now()}_recovery`;
const binaries =
  process.env.OPS_PG_BIN ||
  (process.platform === "win32"
    ? "C:/Program Files/PostgreSQL/17/bin"
    : "/usr/lib/postgresql/17/bin");
const pg = (name: string) =>
  join(binaries, name + (process.platform === "win32" ? ".exe" : ""));
function invokePg(name: string, args: string[], input?: Buffer) {
  const container = process.env.OPS_PG_CONTAINER;
  if (container) {
    if (
      process.env.GITHUB_ACTIONS !== "true" ||
      !/^[a-f0-9]{12,64}$/.test(container)
    )
      throw new Error("Invalid CI test container identity.");
    const mapped = args.map((arg, i) => (args[i - 1] === "-p" ? "5432" : arg));
    return spawnSync("docker", ["exec", "-i", container, name, ...mapped], {
      input,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
  }
  return spawnSync(pg(name), args, {
    input,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}
const report: Record<string, unknown> = {
  environment: "isolated local test",
  providerBackup: "NOT EXECUTABLE",
  productionTouched: false,
};
async function connect(database: string) {
  const c = new Client({ ...connection, database });
  await c.connect();
  await c.query("SET timezone='UTC'");
  return c;
}
async function snapshot(c: Client) {
  const { rows } = await c.query<{ name: string }>(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const result: Record<string, { count: number; digest: string }> = {};
  for (const { name } of rows) {
    assert.match(name, /^[a-z_]+$/);
    const data = await c.query(
      `SELECT to_jsonb(t) AS row FROM public."${name}" t`,
    );
    const encoded = data.rows
      .map((r) => JSON.stringify(r.row))
      .sort()
      .join("\n");
    result[name] = {
      count: data.rowCount ?? 0,
      digest: createHash("sha256").update(encoded).digest("hex"),
    };
  }
  return result;
}
async function main() {
  await mkdir(".phase22-test", { recursive: true });
  const admin = await connect("postgres");
  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [source],
    );
    if (!exists.rowCount)
      await admin.query(`CREATE DATABASE "${source}" OWNER cinebite_test`);
    await admin.query(`ALTER DATABASE "${source}" SET timezone='UTC'`);
    // Recovery is always new, never restore over an existing database.
    assert.equal(
      (
        await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          recovery,
        ])
      ).rowCount,
      0,
    );
    await admin.query(`CREATE DATABASE "${recovery}" OWNER cinebite_test`);
    await admin.query(`ALTER DATABASE "${recovery}" SET timezone='UTC'`);
  } finally {
    await admin.end();
  }
  const c = await connect(source);
  try {
    const table = await c.query(
      "SELECT to_regclass('public.organizations') AS name",
    );
    if (table.rows[0].name)
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int AS count FROM organizations WHERE slug NOT LIKE 'phase22-evidence-%'",
          )
        ).rows[0].count,
        0,
        "Refusing database with non-owned data.",
      );
    const r = spawnSync(
      process.execPath,
      [
        resolve("node_modules/tsx/dist/cli.mjs"),
        "scripts/operations/migrate.ts",
        "--environment=test",
      ],
      { env: process.env, stdio: "inherit", windowsHide: true },
    );
    assert.equal(r.status, 0, "Fresh migrate deploy failed");
    assert.equal(await migrationReadiness(), true);
    report.migrations = { status: "PASS", count: checkMigrationManifest() };
    const fixture = await operationFixtures();
    const before = await snapshot(c);
    const backupStarted = performance.now();
    const dump = invokePg("pg_dump", [
      "-h",
      connection.host,
      "-p",
      String(connection.port),
      "-U",
      connection.user,
      "-d",
      source,
      "-Fc",
      "--no-owner",
      "--no-acl",
    ]);
    assert.equal(dump.status, 0, "Local pg_dump failed");
    assert.ok(dump.stdout.length > 0);
    const key = randomBytes(32),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(dump.stdout),
        cipher.final(),
      ]),
      tag = cipher.getAuthTag();
    await writeFile(
      ".phase22-test/synthetic-backup.enc",
      Buffer.concat([iv, tag, encrypted]),
      { mode: 0o600 },
    );
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const restored = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    assert.equal(
      createHash("sha256").update(restored).digest("hex"),
      createHash("sha256").update(dump.stdout).digest("hex"),
    );
    const restoreStarted = performance.now();
    const restore = invokePg(
      "pg_restore",
      [
        "-h",
        connection.host,
        "-p",
        String(connection.port),
        "-U",
        connection.user,
        "-d",
        recovery,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--single-transaction",
      ],
      restored,
    );
    assert.equal(restore.status, 0, "Restore into new local database failed");
    key.fill(0);
    restored.fill(0);
    dump.stdout.fill(0);
    const recovered = await connect(recovery);
    try {
      assert.deepEqual(
        await snapshot(recovered),
        before,
        "Restored rows differ from snapshot",
      );
      assert.equal(
        (
          await recovered.query(
            "SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated",
          )
        ).rows[0].count,
        0,
      );
      assert.ok(
        (
          await recovered.query(
            "SELECT count(*)::int AS count FROM pg_trigger WHERE NOT tgisinternal",
          )
        ).rows[0].count > 0,
      );
      await assert.rejects(
        recovered.query("UPDATE refunds SET amount=100 WHERE id=$1", [
          fixture.refund.id,
        ]),
        "Financial trigger missing after restore",
      );
      await assert.rejects(
        recovered.query(
          'INSERT INTO location_inventory (id,"organizationId","locationId","inventoryItemId","updatedAt") VALUES ($1,$2,$3,$4,now())',
          [
            "phase22-invalid-foreign-key",
            fixture.other.id,
            fixture.location.id,
            fixture.inventory.id,
          ],
        ),
        "Tenant/FK integrity missing after restore",
      );
      // A deliberate failing migration transaction must not leave its earlier DDL.
      await assert.rejects(
        recovered.query(
          "BEGIN; CREATE TABLE phase22_failed_migration(id int); SELECT 1/0; COMMIT",
        ),
      );
      await recovered.query("ROLLBACK");
      assert.equal(
        (
          await recovered.query(
            "SELECT to_regclass('public.phase22_failed_migration') AS name",
          )
        ).rows[0].name,
        null,
      );
      report.backup = {
        status: "PASS",
        encryptedBytes: encrypted.length,
        durationMs: Math.round(restoreStarted - backupStarted),
        persistentKey: false,
        contents: "synthetic only",
      };
      report.restore = {
        status: "PASS",
        durationMs: Math.round(performance.now() - restoreStarted),
        tableCount: Object.keys(before).length,
        counts: Object.fromEntries(
          Object.entries(before).map(([table, value]) => [table, value.count]),
        ),
        rowDigestsMatch: true,
        financialGuards: "PASS",
        foreignKeys: "PASS",
        failedMigrationRolledBack: true,
      };
    } finally {
      await recovered.end();
    }
    assert.deepEqual(
      await snapshot(c),
      before,
      "Recovery drill changed source database",
    );
    report.status = "PASS";
    await writeFile(
      ".phase22-test/recovery-result.json",
      JSON.stringify(report, null, 2),
    );
    // Private fixture handles for the local browser driver; never commit them.
    await writeFile(".phase22-test/fixture.json", JSON.stringify(fixture), {
      mode: 0o600,
    });
    console.log(JSON.stringify(report));
  } finally {
    await c.end();
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Isolated operations drill failed. No provider resources or credentials were used.",
  );
  process.exitCode = 1;
});
