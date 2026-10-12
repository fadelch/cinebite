# CineBite operations runbook

Phase 19 provides diagnostics, not permission to alter financial truth. Use the current deployed release, an authorized account and your approved secret manager. Never paste credentials, cookie headers, setup URLs, QR credentials or raw provider payloads into an incident ticket.

## First response

1. Record UTC time, environment, deployed release, affected feature and safe request/order reference.
2. Check `GET /api/health` (runtime liveness), then `GET /api/ready` (critical configuration/PostgreSQL readiness).
3. A verified Super Admin opens `/super-admin/operations`. Cinema Admin is intentionally denied platform infrastructure and cross-tenant incidents.
4. Locate the matching `REQ-` or `JOB-` reference in private structured server logs. Compare operation/stage, safe code, status, duration and retryability—not customer notes or credentials.
5. Establish whether the business record committed before retrying anything. Logs and incident cards are not settlement or inventory authority.

Public probes return only controlled status and a correlation header. Healthy liveness does not prove PostgreSQL or the payment provider is available. Unknown provider reachability, missing job history and absent records must not be interpreted as success.

## 1. Customers cannot pay

Check readiness first, then provider-stage errors and the webhook/refund/cancellation queues. Payments may legitimately be disabled by configuration; this is not proof of an outage. Only the explicitly configured sandbox is installed in this repository—no real-money adapter exists.

Use the owning customer's existing order/payment status and supported retry flow. Provider creation uses the durable attempt's idempotency key. After an unknown provider failure, check the original attempt before retrying; the same checkout key recovers a committed order instead of creating another charge. Never treat a browser success redirect as settlement.

Do not manually set Payment to SUCCEEDED, create another attempt outside its supported action, release reserved inventory blindly or ask a customer for card/CVV data.

## 2. Kitchen orders are missing

Confirm the correct cinema/location/filter and current staff role/grants/activity. Check the canonical payment state and fulfillment eligibility: a pending, failed or review-required online payment does not authorize food preparation. Inspect webhook journal/review records and the safe public order code.

A notification backlog may delay the bell without removing the order from the authoritative queue. Refresh the real kitchen queue; do not create a duplicate order to trigger an alert. Supported Accept/Prepare/Ready actions enforce current state and concurrency.

## 3. Notification alerts are delayed

Inspect pending count, oldest pending age, retry count and final failures. Confirm the deployment scheduler is actually calling `POST /api/notifications/process` with its dedicated server-only bearer secret. A route being deployed does not provision a scheduler.

The processor uses SKIP LOCKED and persisted per-event/per-recipient dedupe. Reinvoke the supported job; pending retries become due according to existing backoff. Do not reset attempts, delete durable source events or change business states to manufacture another alert. Terminal failures require operator investigation; there is no new arbitrary force-replay endpoint.

The monitoring job is separate from notification delivery so its diagnostic signal does not depend on the failing outbox.

## 4. Refunds are failing

Inspect the authorized financial summary and canonical Refund status. PROCESSING/PENDING is not a confirmed return of money, and an unknown provider outcome must not be retried as a new independent refund.

An unresolved FAILED refund is shown in platform operations; an authorized cinema supervisor can use the existing confirmed refund-retry action on its own order. That creates/reuses a linked retry with its supported idempotency key and respects the captured balance. A failed predecessor with a linked retry is excluded from the unresolved-failure count; an active retry may still appear as old processing work.

For old pending/processing work, invoke supported payment recovery and check signed/retrieved provider truth. Recovery rotates updatedAt, so attention age is based on original creation. Do not set Refund to SUCCEEDED or issue a blind second refund.

## 5. Delivery queue is unexpectedly empty

Check role/location grants, the selected location/filter, payment eligibility and order readiness. An order must be READY to be claimed. OUT_FOR_DELIVERY is assigned to one staff member; inspect that assignment through the normal authorized workspace.

Concurrent claim conflicts are ordinary 409 warnings, not a platform outage. Refresh current state and use the supported Claim/Delivered actions. Do not overwrite assignments with SQL or bypass current user checks.

## 6. Database is unhealthy

A failed readiness probe safely returns 503; liveness can still return 200. Check private hosting/Neon status, approved connectivity/configuration, connection limits and migration deployment through your established operational tools. Public endpoints intentionally omit database host/name/URL.

Do not reset the database, perform destructive db push, disable tenant authorization or pretend a financial request succeeded. Restore the dependency and recheck readiness plus the existing order/payment before retry. Customer pages now distinguish dependency failure from an expired seat session.

The connection-acquisition limit is 2.5 seconds; probe transactions have bounded waiting/execution. These are diagnostics, not a production throughput/SLA guarantee.

## 7. Webhook processing is failing or backlogged

Use the existing PaymentWebhookEvent journal. The current implementation uses PROCESSED/REJECTED/IGNORED/REVIEW plus internal CANCEL_PENDING/CANCEL_COMPLETE; it does not invent a competing generic webhook history. Display counts cover the last 15 minutes, with internal cancellation backlog reported separately.

HTTP receipt, signature verification, duplicate replays and rollback failures are also distinguished in scrubbed logs. An unverified payload is never persisted as a trusted settlement event. A processing transaction that rolls back may have no new journal row: correlate its safe failure incident/request reference instead.

Restore the dependency and use the provider's authenticated same-event retry or supported retrieval/recovery path. Never delete the journal to “allow” another settlement, accept an unsigned event or manually update stock.

## 8. Background jobs are failing

Inspect last success, last failure/partial, duration, processed/failure counts and stale work. RUNNING after a killed worker is not proof of successful completion. Missing history is UNKNOWN. Dashboard data is bounded; it is not a workflow engine.

Existing scheduled notification and payment-recovery routes now record JobRun state. Opportunistic financial work is traced as operations, not falsely counted as a scheduler execution. Row locks, per-entity financial idempotency and notification dedupe remain the work authority; JobRun is telemetry, not a lease.

Invoke only the supported authenticated processors. Use the notification job secret for notifications, the payment-expiry secret for recovery and a separate observability secret for monitoring. A successful monitor means a diagnostic run completed; it does not mean every monitored business component is healthy.

## 9. Use a request reference

An API response exposes `X-Request-ID: REQ-<generated-uuid>`; normal safe errors also contain that reference. Search the private JSON log stream by this exact value. It links route completion to checkout/provider/transition stages and scheduled work started in that request.

Rendered recovery screens can show Next's safe digest; match it to the structured render event's digest and request ID. Never use a request ID as authentication or accept an attacker-provided identifier as authoritative.

Environment and safe release labels distinguish test/staging/production. Do not search by private contact details or paste raw logs into public issues.

## 10. Retry only supported actions

| Situation | Supported approach |
| --- | --- |
| Checkout/provider initialization interrupted | Check original order, recover with the original checkout/attempt key. |
| Valid webhook processing rolled back | Authenticated same-event delivery or supported provider retrieval. |
| Pending provider cancellation/refund | Authorized payment-recovery job; retain original provider idempotency. |
| Confirmed FAILED refund | Authorized cinema refund-retry action with confirmation and linked retry. |
| Pending notification event | Authenticated notification processor, honoring its due time/backoff. |
| Pending staff identity synchronization | Existing authorized Phase 18 retry action; never override a platform-disabled identity. |
| Operations backlog/incident detection | Authenticated operations-monitor endpoint; this does not mutate money/stock. |

## Scheduler setup

After review/merge and the Phase 19 migration, retain the existing deployment schedules and add a reviewed schedule for `POST /api/operations/monitor`. Bearer secrets must be supplied in headers, never query strings or NEXT_PUBLIC variables. A roughly minute-based schedule is a diagnostic starting point, not a contractual guarantee. Measure workload and configure thresholds for your deployment.

Example shape only:

```text
POST https://<approved-app-origin>/api/operations/monitor
Authorization: Bearer <dedicated-server-only-observability-secret>
```

No production scheduler or external error/alert provider has been provisioned by this phase.

## Dependency and degraded-mode policy

- PostgreSQL is critical for business truth and current authorization: unavailable requests fail safely.
- Payment provider is needed for new paid checkout; recoverable pending records remain durable.
- Firebase Auth failure affects staff authentication, not the anonymous customer's credential model. No staff authorization is bypassed.
- Optional branding/product media should use existing fallback; upload failure does not rewrite settled orders.
- Notification delivery and analytics presentation are not settlement authorities; failures do not reverse committed business records.
- External monitoring is optional and isolated from business outcomes. It receives only a scrubbed envelope if a reviewed adapter is installed.

## Incident handling and recovery

The monitor evaluates current backlog/refund/webhook/processor conditions and stores a deduplicated incident key. Repeated observations update occurrences without emitting a new opening alert each minute; recovery changes an open condition to RESOLVED and emits one recovery event. Existing Phase 17 cinema refund notifications are reused.

HTTP/render incident summaries are historical diagnostic evidence; they are not automatic proof of a current platform-wide outage. They do not auto-resolve on an unrelated successful request. There is no new pager, customer message blast, arbitrary incident-resolution UI or external delivery claim.

## Retention and privacy

The monitoring job deletes at most 1,000 terminal job records and 1,000 resolved incident records older than 30 days per run. Active RUNNING jobs and OPEN incidents are preserved for investigation. It never deletes orders, payments, refunds, inventory movements, order status events or audits. Phase 17 presentation retention remains its own policy.

Console logs are collected/retained by the deployment platform; this repository does not claim a global log archive or configure hosting retention. Restrict log access, choose approved retention and separately review framework/SDK/database/infrastructure logging. Do not enable raw SQL/body/header tracing in production.

## Incident checklist

Record environment/release and UTC time; confirm live versus ready; check current authorization; identify the safe request/job/order reference; inspect authoritative records; distinguish transient dependency failure from business conflict; restore the dependency; retry only through supported idempotency; verify recovery and monitor counts; document only minimized facts. Never invent success to clear a dashboard warning.
