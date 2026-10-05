import "server-only";

export function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

// Raw SQL through driver adapters may expose PostgreSQL serialization/deadlock
// SQLSTATE as P2010 rather than Prisma's P2034. Retry only these known states.
export function isRetryableTransactionError(error: unknown): boolean {
  if (isPrismaError(error, "P2034")) return true;
  if (!isPrismaError(error, "P2010")) return false;
  const meta = (error as { meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } }).meta;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.originalCode;
  return code === "40001" || code === "40P01";
}
