import assert from "node:assert/strict";
async function main() {
  if (
    process.env.GITHUB_REF !== "refs/heads/main" ||
    process.env.GITHUB_ACTIONS !== "true"
  )
    throw new Error("Trusted main workflow required.");
  const sha = process.env.GITHUB_SHA,
    repo = process.env.GITHUB_REPOSITORY;
  assert.match(sha ?? "", /^[a-f0-9]{40}$/);
  assert.match(repo ?? "", /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
  const origin = process.env.CINEBITE_STAGING_ORIGIN,
    cookie = process.env.CINEBITE_SMOKE_COOKIE;
  const registry = JSON.parse(process.env.CINEBITE_RESOURCE_REGISTRY ?? "");
  assert.equal(registry.staging?.origin, origin);
  assert.ok(
    registry.production || registry.development,
    "Protected existing resource identities required.",
  );
  for (const resource of [registry.production, registry.development].filter(
    Boolean,
  ))
    assert.notEqual(resource.origin, origin);
  const u = new URL(origin ?? "");
  assert.equal(u.protocol, "https:");
  assert.equal(u.origin, origin);
  assert.ok(!u.username && !u.password);
  assert.ok(cookie, "Authenticated staging smoke session required.");
  const checks = await fetch(
    `https://api.github.com/repos/${repo}/commits/${sha}/check-runs`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    },
  );
  assert.equal(checks.status, 200);
  const summary = await checks.json();
  assert.ok(
    summary.check_runs?.some(
      (r) =>
        r.name === "CineBite required checks" &&
        r.head_sha === sha &&
        r.status === "completed" &&
        r.conclusion === "success",
    ),
    "Required CI has not passed on this exact commit.",
  );
  for (const pathname of [
    "/api/health",
    "/api/ready",
    "/login",
    "/api/super-admin/release",
  ]) {
    const headers = {};
    if (pathname === "/api/super-admin/release") headers.Cookie = cookie;
    if (process.env.CINEBITE_VERCEL_PROTECTION_BYPASS)
      headers["x-vercel-protection-bypass"] =
        process.env.CINEBITE_VERCEL_PROTECTION_BYPASS;
    const response = await fetch(new URL(pathname, origin), {
      headers,
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    assert.equal(response.status, 200);
    if (pathname === "/api/super-admin/release") {
      const release = await response.json();
      assert.equal(release.environment, "staging");
      assert.equal(release.release, sha);
      assert.equal(release.migrations, "ready");
    }
  }
  console.log(
    JSON.stringify({
      stagingSmoke: "PASS",
      reviewedCommit: sha,
      authenticatedRelease: true,
      policy: "read-only; no deployment or production access",
    }),
  );
}
main().catch(() => {
  console.error(
    "Staging acceptance refused or smoke failed. Configure the protected staging environment and verify its actual deployment; no secrets displayed.",
  );
  process.exitCode = 1;
});
