# Phase 9 manual and integration verification report

Execution date: 2026-09-27
Target: the safe PostgreSQL organization with slug `cinebite-demo-cinemas`

The checks below used only deterministic automated tests, read-only database inspection, or exact temporary integration records that were removed immediately after verification. No production reset, destructive schema operation, Firestore business write, credential output, or private screenshot was used.

| Test | Result | Evidence / notes |
| --- | --- | --- |
| 1. Movie creation | PASS | The real database contains active `Interstellar`, runtime 169, English, PG-13; it is refreshed idempotently by the demo seed. |
| 2. Duplicate movie | PASS | A real duplicate `interstellar` slug insert was rejected; repository/API tests verify the friendly conflict mapping rather than a raw Prisma response. |
| 3. Movie validation | PASS | A real runtime `0` insert was rejected by PostgreSQL; Zod tests cover zero, negative, fractional, and values above 600. |
| 4. Screening creation | PASS | Real demo Screenings were created for Interstellar and Dune; duration-based end suggestion is covered by deterministic timezone tests. |
| 5. Invalid time range | PASS | Real equal and reversed time inserts were rejected by the database check; service tests verify friendly validation before mutation. |
| 6. Same-Hall overlap | PASS | Real overlapping writes were rejected by the PostgreSQL exclusion constraint. |
| 7. Partial overlap | PASS | A real partial-overlap insert was rejected. |
| 8. Contained overlap | PASS | A real contained-overlap insert was rejected. |
| 9. Surrounding overlap | PASS | A real surrounding-overlap insert was rejected. |
| 10. Exact adjacency | PASS | The seeded Dune Screening starts exactly when the live Interstellar Screening ends in Demo Beirut Hall 1. |
| 11. Different Hall | PASS | An overlapping Dune Screening exists successfully in Demo Beirut Hall 2. |
| 12. Different Location | PASS | An overlapping Interstellar Screening exists successfully in Demo Dbayeh Hall 1. |
| 13. Inactive Movie | PASS | Repository/service tests verify inactive Movie rejection while historical relationships remain readable. |
| 14. Screening cancellation | PASS | A real cancelled Screening remains stored, reports `CANCELLED`, and has a safe audit record. |
| 15. Cancelled slot reuse | PASS | A cancelled Hall 1 interval overlaps the live scheduled interval without blocking it, proving the partial constraint excludes cancelled rows. |
| 16. Temporal states | PASS | Real seeded records resolved to `UPCOMING`, `LIVE`, `ENDED`, and `CANCELLED`. |
| 17. Boundaries | PASS | Deterministic tests prove start-inclusive and end-exclusive behavior. |
| 18. Timezone | PASS | Real locations use `Asia/Beirut`; deterministic conversion/round-trip and DST tests pass. |
| 19. Active Screening by Hall | PASS | The real resolver returned Interstellar for Demo Beirut Hall 1. |
| 20. Active Screening by Seat | PASS | The real resolver returned Organization, Demo Beirut, Hall 1, Seat A7, live Screening, and Interstellar. |
| 21. No active Screening | PASS | The real resolver returned `NO_ACTIVE_SCREENING` for Demo Beirut Hall 2 before its future Screening. |
| 22. Future Screening ignored | PASS | Hall 2 contained only a future Screening and returned no active Screening. |
| 23. Cancelled Screening ignored | PASS | Hall 1 contained an overlapping cancelled row but resolved the scheduled Interstellar Screening. |
| 24. Location Manager | PASS | Executed service authorization tests cover authorized and unauthorized Location behavior plus Movie-edit denial. |
| 25. Cross-tenant protection | PASS | Executed repository tests reject cross-tenant Movie/Hall references before creation. |
| 26. Other roles | PASS | Executed access tests deny Kitchen and Delivery staff schedule administration. |
| 27. Screening edit conflict | PASS | Executed repository tests rerun overlap validation while excluding only the edited row. |
| 28. Live / ended protection | PASS | Executed repository tests reject live/ended core changes; the built UI renders them locked/read-only. |
| 29. Concurrent overlap | PASS | Two real concurrent overlapping inserts produced one success, one rejection, and exactly one stored row; both exact temporary IDs were then removed. |
| 30. Database | PASS | Direct inspection verified Movie/Screening relations, timestamps, statuses, Locations, Halls, and Seats. |
| 31. Firestore | PASS | Source inspection found no Phase 9 Firestore references or business writes. |
| 32. Audit logs | PASS | Eight idempotent demo audit records exist with IDs/times and `demoSeed: true`; no secrets are included. |
| 33. Responsive UI | NOT EXECUTABLE IN CURRENT ENVIRONMENT | Production build passed, but no authenticated browser automation session was available for viewport interaction. |
| 34. Motion / accessibility | NOT EXECUTABLE IN CURRENT ENVIRONMENT | Static review and lint passed, but keyboard and reduced-motion behavior require an authenticated interactive browser session. |

## Totals

- PASS: 32
- FAIL: 0
- NOT EXECUTABLE IN CURRENT ENVIRONMENT: 2

## LinkedIn evidence

No image was fabricated or committed. The database and application are ready for real capture, but this environment had no authenticated browser automation session. Follow `linkedin/phase-9/README.md` after signing in. No full-desktop screenshot or image containing credentials was committed.
