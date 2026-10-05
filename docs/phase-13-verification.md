# Phase 13 verification

Executed on 2026-10-05 with Next.js 16.3.8, PostgreSQL 17, Firebase Auth emulator (CLI 15.32.1) and installed headless Chrome/Playwright. The application was the optimized production build, not a mocked screenshot renderer.

## Results

The offline test suite (**365 tests in 51 files**), ESLint, TypeScript, production build, Prisma validation and Prisma generation pass. All nine migrations applied successfully to a newly initialized **local** test database; `prisma migrate status` reports up to date and `prisma migrate diff --exit-code` reports **no schema difference**. Production Neon migration remains a controlled operator step after review/merge.

The mandatory cases A–AD each have an actual outcome in [phase-13-integration-results.json](phase-13-integration-results.json): **30 PASS, 0 FAIL, 0 NOT EXECUTABLE**. The scenario executed real HTTP and browser requests, not just test descriptions. It was rerun after mobile layout refinements, including actual history pagination and delivered-date/Hall/code/worker filters.

Critical evidence includes two distinct delivery workers racing a real PostgreSQL claim (one HTTP 200, one HTTP 409, one assigned User and one event); denied non-assignee completion; denied kitchen/customer/foreign-location/foreign-tenant access; persisted ownership after a fresh staff login; unchanged stock and consumption counts; escaped script-like notes; original snapshots after Product/Seat renaming; and successful completion after screening end/cancellation or guest-session expiry. The same open customer page automatically observed READY, on the way and Delivered. At 390×844 the actual phone action sequence completed; the tablet/desktop supervisor interface, keyboard dialog/Escape and horizontal-overflow checks passed.

## Isolation and reproducibility

The runner uses only `127.0.0.1:55413/cinebite_phase13_test`, Auth emulator `127.0.0.1:9133`, project `demo-cinebite-phase13`, and its own Next.js server at port 3113. It never loads `.env.local`; its temporary signing key stays in memory. All staff users exist only in the emulator and are disabled after the run. Business fixtures are isolated `phase13-evidence-*` records in local PostgreSQL; no production Neon/Firebase writes occur.

Offline tests mock database/Firebase dependencies and make no production requests. Full integration is intentionally a separate explicit command. See the main README for setup; the isolated cluster data and emulator debug files are ignored by Git.

## Screenshot review and security

Eight PNGs in `linkedin/phase-13` were individually inspected at native resolution after capture. They show real demo application UI, legible destination text and complete application content where appropriate, without taskbar/browser chrome/DevTools/notification overlays. No passwords, connection strings, private emails, UID/assignment/session identifiers, cookies, QR codes or tokens are visible. Staging is audited separately before commit.

## Limitations

This is real PostgreSQL concurrency verification with emulated Firebase identity/session APIs, not a claim that production Firebase was exercised. No physical phone, production Neon deployment, load test or external network/Wi-Fi test was performed. Browser phone emulation covers the specified viewport and practical controls. No payment, reassignment, emergency override, restock or routing workflow is present. Existing dependency audit advisories are documented separately; passing tests are not a claim of zero ecosystem vulnerabilities.

`npm install` reports the same existing **16 dependency advisories (14 high, 2 moderate)**. No forced major-version audit fix was applied within delivery scope. The Auth-emulator setup follows [Firebase's official connection guide](https://firebase.google.com/docs/emulator-suite/connect_auth); the installed SDK and local HTTP/database checks supply this phase's execution evidence.
