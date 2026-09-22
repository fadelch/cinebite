import {
  applyMigrationPlan,
  createMigrationRunner,
  MigrationConflictError,
  MigrationValidationError,
  type MigrationCounts,
} from "../src/server/migration/firestore-to-postgres";
import { readLegacyFirestoreSource } from "../src/server/migration/firestore-source";

const argumentsList = process.argv.slice(2);
const apply = argumentsList.length === 1 && argumentsList[0] === "--apply";
const validArguments = argumentsList.length === 0 || apply;

function printCounts(
  source: MigrationCounts,
  postgres: MigrationCounts | null,
): void {
  console.table(
    Object.entries(source).map(([entity, firestore]) => ({
      entity,
      firestore,
      postgresql: postgres?.[entity as keyof MigrationCounts] ?? "not written",
      status:
        postgres === null
          ? "VALIDATED"
          : firestore === postgres[entity as keyof MigrationCounts]
            ? "MATCH"
            : "MISMATCH",
    })),
  );
}

async function main(): Promise<void> {
  if (!validArguments) {
    console.error(
      "Usage: npm run migrate:firestore-postgres [-- --apply]. The command defaults to a read-only dry run.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const run = createMigrationRunner({
      readSource: readLegacyFirestoreSource,
      apply: applyMigrationPlan,
    });
    const report = await run(apply);

    console.log(`Migration mode: ${report.mode}`);
    printCounts(report.sourceCounts, report.postgresCounts);

    if (report.mode === "DRY_RUN") {
      console.log("Dry run completed. PostgreSQL writes: 0.");
      console.log(
        "After reviewing this report, apply deliberately with: npm run migrate:firestore-postgres -- --apply",
      );
    } else {
      console.log(
        report.alreadyApplied
          ? "PostgreSQL already exactly matches this migration plan; no duplicate writes were made."
          : "Migration applied in one transaction and post-write counts match.",
      );
    }
  } catch (error) {
    if (
      error instanceof MigrationValidationError ||
      error instanceof MigrationConflictError
    ) {
      console.error(`${error.name}: ${error.message}`);
    } else {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "UNEXPECTED";
      console.error(`Migration failed safely (${code}). No credentials were logged.`);
    }
    process.exitCode = 1;
  }
}

void main();
