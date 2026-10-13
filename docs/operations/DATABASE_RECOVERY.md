# Database backup and recovery

## Scope and evidence

The Phase 22 local drill actually ran `pg_dump -Fc --no-owner --no-acl` against an explicitly loopback, synthetic-only database, AES-256-GCM-encrypted the dump, decrypted in memory and used `pg_restore --exit-on-error --single-transaction` into a **new** isolated database. All 42 public tables' counts and row digests matched, 21 migration records survived, and financial/FK rejection tests passed. Neither source nor production was restored over.

The local encryption key existed only in memory and was zeroed after the drill; the ignored encrypted test artifact is not an operator-recoverable long-term backup. This is intentional for synthetic rehearsal, **not** a production backup service. No provider PITR window, production backup or production restore was verified. Those remain NOT EXECUTABLE.

## Real backup policy to configure

An owner must verify the actual Neon project's plan, retained restore window, oldest/latest available restore timestamps, backup coverage and recoverability. Record dated private evidence and who checked it. PITR availability/retention depends on your configured provider resources; never infer it from generic docs. For high-risk changes require a recent tested snapshot/backup, retention covering the change and an approved recovery destination.

Use encryption with a managed recoverable key, restricted object storage/access, audited credentials, retention and expiry. Do not store real dump files in the repository/CI artifacts or a public portfolio. Do not pass connection passwords in argv; use approved secret injection/libpq credential mechanisms with restrictive permissions. Pin restore/dump client major to the database major. Dump consistency assumes a proper transaction snapshot; this small drill was quiescent, and is not proof under production writes.

## Restore procedure (operator-only)

1. Freeze risky app changes and name a recovery owner. Capture exact source/environment, target identity, backup/PITR timestamp, incident timeline and known externally completed payments.
2. Resolve and independently verify an **empty separate target** with different credentials and no live scheduler/webhook traffic. Obtain approval for costs. Do not drop, truncate or restore over production.
3. For Neon PITR, restore into a separate branch/project through authorized provider tooling at the verified timestamp. A production-derived backup contains sensitive data: keep it in a restricted recovery environment, not ordinary synthetic staging. If using an approved encrypted dump, decrypt through the managed key mechanism and restore with stop-on-error semantics.
4. Validate migration names/checksums, row counts, representative records, foreign keys, constraints, functions and indexes. Compare exact money totals by currency and order/payment/refund links, inventory reservations/consumption, tenant links and immutable histories. Totals are not enough; inspect relational integrity and representative flow.
5. Restore PostgreSQL **does not** rewind a PSP, Firebase identities, Storage objects or sent notifications. Reconcile provider payments/refunds from authoritative external state, revoke invalid sessions as appropriate, and validate referenced media. Keep processors disabled until replay/deduplication policy and reconciliation are approved. Never charge/refund again just because a restored row looks pending.
6. Run read-only readiness/auth smoke on the recovered target, then the approved sandbox tests only when the target is clearly nonproduction. Record timing and residual risks. A data-owner review is required before any connection switch; no such switch is performed here.

## RPO / RTO

Proposed planning targets are RPO ≤15 minutes and RTO ≤60 minutes, subject to budget/plan, measurement and approval; they are **not achieved SLAs**. The quiescent local snapshot matched exactly at its snapshot point. Its measured dump/restore duration is in Phase 22 evidence, not a hosted recovery-time claim. Full RTO includes detection, approval, provisioning, restore, reconciliation, smoke and traffic switching.

## Repeat the safe local drill

Provide PostgreSQL 17 tools (`OPS_PG_BIN` if needed), an isolated cluster bound to loopback port 55414 and role `cinebite_test`, then:

```powershell
npm run test:operations
```

Never load `.env.local`. The driver rejects inherited production markers before replacing env values, refuses non-owned organization data and creates a fresh unique recovery DB instead of deleting existing DBs. It saves encrypted synthetic evidence under ignored `.phase22-test`. Retained local test DBs/artifacts can be cleaned up later with explicit target validation; this task does not force-drop them or terminate unrelated connections.
