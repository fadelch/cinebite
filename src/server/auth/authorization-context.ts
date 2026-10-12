import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
// Request-local authorization snapshot, never telemetry or a process-wide identity cache.
const snapshots = new AsyncLocalStorage<Map<string, number>>();
export function authorizationScope<T>(action: () => T): T {
  return snapshots.run(new Map(), action);
}
export function rememberAuthorization(uid: string, version: number) {
  snapshots.getStore()?.set(uid, version);
}
export function requestAuthorizationVersion(uid: string) {
  return snapshots.getStore()?.get(uid);
}
