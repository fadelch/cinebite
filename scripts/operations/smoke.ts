import assert from "node:assert/strict";
import { validateEnvironment } from "../../src/lib/operations/environment";
let check = "configuration";
async function main() {
  const { environment, resource } = validateEnvironment();
  const origin = process.env.CINEBITE_SMOKE_ORIGIN ?? resource.origin;
  const url = new URL(origin);
  // A local production-mode test process may use HTTP loopback; hosted smoke cannot.
  if (
    origin !== resource.origin &&
    !(
      environment === "test" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    )
  )
    throw new Error("Smoke origin does not match pinned environment.");
  if (url.origin !== origin || url.username || url.password)
    throw new Error("Invalid smoke origin.");
  const cookie = process.env.CINEBITE_SMOKE_COOKIE;
  const checks: string[] = [];
  for (const pathname of [
    "/api/health",
    "/api/ready",
    "/login",
    ...(cookie ? ["/api/super-admin/release"] : []),
  ]) {
    check = pathname;
    const r = await fetch(new URL(pathname, origin), {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers:
        cookie && pathname === "/api/super-admin/release"
          ? { Cookie: cookie }
          : {},
    });
    assert.equal(r.status, 200, `Smoke failed: ${pathname}`);
    if (pathname === "/api/super-admin/release") {
      const body = await r.json();
      check = "release environment";
      assert.equal(body.environment, environment);
      check = "release SHA";
      assert.equal(
        body.release,
        process.env.OBSERVABILITY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
      );
      check = "migration readiness";
      assert.equal(body.migrations, "ready");
    }
    checks.push(pathname);
  }
  console.log(
    JSON.stringify({
      environment,
      status: "PASS",
      checks,
      releaseVerified: Boolean(cookie),
      policy: "read-only; no redirects; no payments",
    }),
  );
}
main().catch(() => {
  console.error(
    `Deployment smoke failed at ${check}; promotion prohibited. No credentials displayed.`,
  );
  process.exitCode = 1;
});
