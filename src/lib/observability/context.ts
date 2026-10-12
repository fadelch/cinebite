import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
export interface ObservationContext {
  requestId?: string;
  jobRunId?: string;
  operation?: string;
}
const context = new AsyncLocalStorage<ObservationContext>();
export function currentObservation() {
  return context.getStore() ?? {};
}
export function newRequestId() {
  return "REQ-" + randomUUID();
}
export function newJobRunId() {
  return "JOB-" + randomUUID();
}
export function observationScope<T>(
  fields: ObservationContext,
  action: () => T,
): T {
  return context.run({ ...currentObservation(), ...fields }, action);
}
