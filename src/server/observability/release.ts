import "server-only";
import { prisma } from "@/lib/db/prisma";
import manifest from "@/lib/operations/migrations.json";
export async function migrationReadiness() {
  try {
    const rows = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
        return tx.$queryRaw<
          {
            migration_name: string;
            checksum: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
          }[]
        >`SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations`;
      },
      { timeout: 2000, maxWait: 1000 },
    );
    return (
      !rows.some((r) => !r.finished_at && !r.rolled_back_at) &&
      manifest.every((m) =>
        rows.some(
          (r) =>
            r.migration_name === m.name &&
            (r.checksum === m.checksum ||
              r.checksum === m.legacyWindowsChecksum) &&
            r.finished_at &&
            !r.rolled_back_at,
        ),
      )
    );
  } catch {
    return false;
  }
}
export async function releaseStatus() {
  return {
    environment: process.env.CINEBITE_ENVIRONMENT ?? "development",
    release: process.env.CINEBITE_BUILD_RELEASE ?? "local-unversioned",
    migrations: (await migrationReadiness()) ? "ready" : "unavailable",
    expectedMigrationCount: manifest.length,
    scheduler: process.env.CINEBITE_SCHEDULER ?? "disabled",
  };
}
