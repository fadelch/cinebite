# Delivery drag-and-drop

Date: 2026-10-15. Branch: `feat/delivery-drag-and-drop`. Base: `055d5a53b18dcdd2e8efbf032db40283ac6e23ed`.

Delivery workers can drag Ready to claim → My deliveries → Recently delivered. Completion should happen after handing the order to the customer. Only valid next columns highlight. Supervisors remain read-only. Existing buttons support keyboard and touch interaction; native desktop drag is an additional control, not a mobile gesture requirement.

Drops use the existing POST endpoint with the expected status. The server still checks current role, location, assignment and fulfillment eligibility. Foreign drags, missing/stale queue records, unavailable queues, skipped steps and duplicate in-flight actions are rejected by the UI; server checks remain authoritative. No optimistic status or financial changes are made in the browser.

Validation executed locally:

- Clean `npm ci`, Prisma generation, ESLint, TypeScript, Prisma validation: PASS.
- Full Vitest: 768 tests / 84 files PASS (includes 22 new drop-control cases).
- Production build with synthetic environment: PASS. The first sandbox attempt could not fetch the existing Google font; network-enabled rerun passed. A browser-harness actor typing error was corrected before the successful build.
- `tests/delivery/drag-browser.ts --local`: five actual Chrome/PostgreSQL/Auth-emulator scenarios PASS: skipped claiming denied; drag claims; other worker and supervisor denied; drag completes once with payment/refund/stock unchanged; mobile history has no horizontal overflow or runtime exceptions.
- Separate seat-check-in PostgreSQL regression: 13 scenarios PASS.
- Repository/history/client secret scan: no findings. No real credentials or synthetic identity tokens are printed by the browser driver.

The browser test requires the current synthetic production build, the demo Auth emulator on `127.0.0.1:9144`, and the migrated synthetic `cinebite_phase24_test` database on `127.0.0.1:55424`. It owns its server on port 3124 and refuses an occupied port. It creates only synthetic fixtures and retains them for inspection. It does not load `.env.local`.

```powershell
node scripts/operations/ci-environment.mjs node_modules/next/dist/bin/next build
node node_modules/tsx/dist/cli.mjs --conditions=react-server tests/delivery/drag-browser.ts --local
```

No hosted deployment or physical-device acceptance was performed. Phase 23 is not declared complete. Security-review remediation is maintained separately on `audit/post-phase-23-security`.
