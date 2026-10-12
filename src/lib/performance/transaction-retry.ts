/** Backoff is bounded and only used after a retryable transaction rollback. */
export function transactionRetryDelay(attempt: number, random = Math.random()) {
  return (
    Math.min(100, 10 * 2 ** Math.min(Math.max(attempt, 0), 4)) +
    Math.floor(Math.min(1, Math.max(0, random)) * 20)
  );
}
export async function waitForTransactionRetry(attempt: number) {
  await new Promise((resolve) =>
    setTimeout(resolve, transactionRetryDelay(attempt)),
  );
}
