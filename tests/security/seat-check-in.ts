import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { localEnvironment } from "../../scripts/operations/ci-environment.mjs";
import { assertNonProductionToolEnvironment, assertSafeFixtureTarget } from "@/lib/operations/environment";
import { prisma } from "@/lib/db/prisma";
import { operationFixtures } from "../operations/fixtures";
import { issueSeatCheckInRecord } from "@/server/repositories/seat-check-in.repository";
import { createCustomerSessionRecord } from "@/server/repositories/customer-session.repository";
import { assertCustomerSessionAuthorization } from "@/server/repositories/customer-session-authorization";
import { startCustomerSession, validateCustomerSession } from "@/server/services/customer-session.service";
import { revokeSeatQrRecord, replaceSeatQrRecord } from "@/server/repositories/seat-qr.repository";
import { createOpaqueToken, hashOpaqueToken } from "@/lib/security/opaque-token";
import { setCartItemRecord } from "@/server/repositories/cart.repository";
import { placeOrderRecord } from "@/server/repositories/order.repository";

assertNonProductionToolEnvironment();
assert.ok(process.argv.includes("--local"), "Use --local; do not load a real env file.");
const port = Number(process.env.SEAT_CHECK_IN_TEST_PORT ?? "55424");
assert.ok([55414, 55424].includes(port));
Object.assign(process.env, localEnvironment("cinebite_phase24_test"));
process.env.DATABASE_URL = process.env.DATABASE_URL!.replace(":55414/", `:${port}/`);
process.env.DIRECT_URL = process.env.DATABASE_URL;
assertSafeFixtureTarget();
const checks: string[] = [];
let current = "fresh isolated migrations";

async function main() {
  const admin = new Client({ host: "127.0.0.1", port, user: "cinebite_test", database: "postgres" });
  await admin.connect();
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='cinebite_phase24_test'")).rowCount)
      await admin.query('CREATE DATABASE "cinebite_phase24_test" OWNER cinebite_test');
  } finally { await admin.end(); }
  const migrate = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, encoding: "utf8", windowsHide: true });
  assert.equal(migrate.status, 0, "Isolated migration failed.");
  checks.push(current);
  const fixture = await operationFixtures();
  const actorUid = `seat-check-in-${randomUUID()}`;
  await prisma.user.create({ data: { firebaseUid: actorUid, email: `${actorUid}@example.test`, displayName: "Synthetic ticket operator", memberships: { create: { organizationId: fixture.organization.id, role: "CINEMA_ADMIN", allLocations: true } } } });
  const scope = { actorUid, organizationId: fixture.organization.id, locationId: fixture.location.id, hallId: fixture.hall.id };
  const financialTables = ["orders", "order_items", "order_status_events", "payments", "payment_attempts", "refunds", "inventory_movements", "inventory_reservations", "location_inventory"];
  async function financialDigest() {
    const rows = [];
    for (const table of financialTables) {
      const data = await prisma.$queryRawUnsafe<Array<{ row: unknown }>>(`SELECT to_jsonb(t) AS row FROM public."${table}" t`);
      rows.push([table, data.map(r => JSON.stringify(r.row)).sort()]);
    }
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  const financialBefore = await financialDigest();
  async function seat(number: number) {
    const id = randomUUID();
    await prisma.seat.create({ data: { id, hallId: fixture.hall.id, row: "B", number, label: `B${number}` } });
    const credential = createOpaqueToken();
    const qr = await prisma.seatQrCode.create({ data: { hallId: fixture.hall.id, seatId: id, tokenHash: hashOpaqueToken(credential) } });
    return { id, credential, qr };
  }
  type Seat = Awaited<ReturnType<typeof seat>>;
  const issue = (target: Seat, replaceExistingSession = false) => issueSeatCheckInRecord({ ...scope, seatId: target.id, ticketReference: `synthetic-${randomUUID()}`, replaceExistingSession });
  async function redeem(target: Seat, accessCode: string) {
    const rawToken = createOpaqueToken();
    const record = await createCustomerSessionRecord({ qrId: target.qr.id, qrHash: target.qr.tokenHash, tokenHash: hashOpaqueToken(rawToken), hallId: fixture.hall.id, seatId: target.id, screeningId: fixture.screening.id, accessCode, now: new Date(), expiresAt: fixture.screening.endsAt });
    return { record, rawToken };
  }
  const a = await seat(1), b = await seat(2);
  current = "remote permanent QR alone cannot create or revoke a legitimate session";
  await assert.rejects(startCustomerSession({ credential: fixture.qr }));
  await assert.rejects(startCustomerSession({ credential: fixture.qr, accessCode: "000000000000" }));
  assert.equal((await prisma.customerSession.findUniqueOrThrow({ where: { id: fixture.session.id } })).status, "ACTIVE");
  checks.push(current);

  current = "wrong and cross-seat code denied without creating sessions";
  const issued = await issue(a);
  await assert.rejects(redeem(b, issued.accessCode));
  await assert.rejects(redeem(a, issued.accessCode === "000000000000" ? "111111111111" : "000000000000"));
  assert.equal(await prisma.customerSession.count({ where: { seatId: a.id } }), 0);
  checks.push(current);

  current = "concurrent single-use verification has exactly one winner";
  const concurrent = await Promise.allSettled([redeem(a, issued.accessCode), redeem(a, issued.accessCode)]);
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
  const winner = concurrent.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof redeem>>>;
  await validateCustomerSession(winner.value.rawToken);
  await assert.rejects(redeem(a, issued.accessCode));
  assert.equal(await prisma.customerSession.count({ where: { seatId: a.id, status: "ACTIVE" } }), 1);
  checks.push(current);

  current = "existing session replacement requires fresh explicit staff reauthorization";
  await assert.rejects(issue(a), e => (e as { code: string }).code === "SEAT_ALREADY_CHECKED_IN");
  const replacement = await issue(a, true);
  await validateCustomerSession(winner.value.rawToken); // issuing alone must not evict
  const second = await redeem(a, replacement.accessCode);
  await assert.rejects(validateCustomerSession(winner.value.rawToken));
  await validateCustomerSession(second.rawToken);
  checks.push(current);

  current = "five failed attempts persist and lock verification";
  const lockedCode = await issue(b);
  for (let i = 0; i < 5; i++) await assert.rejects(redeem(b, lockedCode.accessCode === "000000000000" ? "111111111111" : "000000000000"));
  const locked = await prisma.seatCheckIn.findFirstOrThrow({ where: { qrId: b.qr.id }, orderBy: { createdAt: "desc" } });
  assert.equal(locked.failedAttempts, 5); assert.equal(locked.status, "LOCKED");
  await assert.rejects(redeem(b, lockedCode.accessCode));
  checks.push(current);

  current = "expired and previous-screening codes cannot authorize a new screening";
  const expired = await issue(b);
  await prisma.seatCheckIn.updateMany({ where: { qrId: b.qr.id, status: "ISSUED" }, data: { expiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(redeem(b, expired.accessCode));
  const old = await issue(b);
  await prisma.screening.update({ where: { id: fixture.screening.id }, data: { endsAt: new Date(Date.now() - 1) } });
  const next = await prisma.screening.create({ data: { hallId: fixture.hall.id, movieId: fixture.screening.movieId, startsAt: new Date(Date.now() - 1), endsAt: new Date(Date.now() + 3600000) } });
  await assert.rejects(startCustomerSession({ credential: b.credential, accessCode: old.accessCode }));
  await prisma.screening.update({ where: { id: next.id }, data: { status: "CANCELLED" } });
  await prisma.screening.update({ where: { id: fixture.screening.id }, data: { endsAt: fixture.screening.endsAt } });
  checks.push(current);

  current = "QR revocation atomically blocks active session and pending codes";
  const pending = await issue(b);
  await revokeSeatQrRecord({ ...scope, seatId: a.id, seatLabel: "B1" });
  await assert.rejects(validateCustomerSession(second.rawToken));
  await assert.rejects(prisma.$transaction(tx => assertCustomerSessionAuthorization(tx, second.record.id)));
  checks.push(current);

  current = "rotation racing redemption never leaves an authorized old-QR session";
  const rotatedCredential = createOpaqueToken();
  await Promise.allSettled([
    redeem(b, pending.accessCode),
    replaceSeatQrRecord({ ...scope, seatId: b.id, seatLabel: "B2", expectedVersion: b.qr.version, tokenHash: hashOpaqueToken(rotatedCredential), storagePath: null, imageData: null, action: "SEAT_QR_ROTATED" }),
  ]);
  assert.equal((await prisma.seatQrCode.findUniqueOrThrow({ where: { id: b.qr.id } })).version, 2);
  assert.equal(await prisma.customerSession.count({ where: { seatId: b.id, status: "ACTIVE" } }), 0);
  assert.equal(await prisma.seatCheckIn.count({ where: { qrId: b.qr.id, status: "ISSUED" } }), 0);
  await assert.rejects(redeem(b, pending.accessCode));
  checks.push(current);

  current = "revocation serializes against in-flight authorized writes";
  const c = await seat(3), grant = await issue(c), active = await redeem(c, grant.accessCode);
  let entered!: () => void, release!: () => void;
  const held = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
  const write = prisma.$transaction(async tx => { await assertCustomerSessionAuthorization(tx, active.record.id); entered(); await gate; }, { timeout: 10000 });
  await held;
  let revoked = false;
  const revocation = revokeSeatQrRecord({ ...scope, seatId: c.id, seatLabel: "B3" }).then(() => { revoked = true; });
  await new Promise(r => setTimeout(r, 100)); assert.equal(revoked, false);
  release(); await write; await revocation;
  await assert.rejects(prisma.$transaction(tx => assertCustomerSessionAuthorization(tx, active.record.id)));
  await assert.rejects(setCartItemRecord({ customerSessionId: active.record.id, productId: fixture.product.id, quantity: 1, unitPrice: "4.00", currencyCode: "USD" }));
  await assert.rejects(placeOrderRecord({ customerSessionId: active.record.id, idempotencyKey: randomUUID(), customerNote: null, now: new Date() }));
  checks.push(current);

  current = "cross-tenant issuance and suspended operator denied at transaction boundary";
  await assert.rejects(issueSeatCheckInRecord({ ...scope, organizationId: fixture.other.id, seatId: c.id, ticketReference: "synthetic", replaceExistingSession: true }));
  await prisma.user.update({ where: { firebaseUid: actorUid }, data: { active: false } });
  await assert.rejects(issue(c, true));
  checks.push(current);

  current = "verification rate limit persists across instances and failed attempts";
  const d = await seat(4);
  for (let i = 0; i < 10; i++) await assert.rejects(startCustomerSession({ credential: d.credential, accessCode: "000000000000" }));
  await assert.rejects(startCustomerSession({ credential: d.credential, accessCode: "000000000000" }), e => (e as { code: string }).code === "SECURITY_RATE_LIMITED");
  checks.push(current);

  current = "paid orders, payment/refund history and inventory unchanged";
  assert.equal(await financialDigest(), financialBefore);
  checks.push(current);
  console.log(JSON.stringify({ status: "PASS", resource: "fresh loopback PostgreSQL only", productionTouched: false, checks }));
}
main().catch(error => { console.error(JSON.stringify({ status: "FAIL", current, errorCategory: error?.code ?? error?.name ?? "Error", checksCompleted: checks })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
