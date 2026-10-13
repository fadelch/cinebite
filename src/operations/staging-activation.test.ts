import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/app", () => ({ cert: vi.fn(), getApp: vi.fn(), getApps: vi.fn(), initializeApp: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));
vi.mock("firebase-admin/storage", () => ({ getStorage: vi.fn() }));
vi.mock("@/lib/env.server", () => ({ getServerEnv: vi.fn() }));
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { getStorage } from "firebase-admin/storage";
import { getServerEnv } from "@/lib/env.server";
import { assertMediaStorageEnabled } from "@/lib/firebase/storage-policy";
import { activateStagingAuth, STAGING_FIREBASE_PROJECT } from "../../scripts/operations/firebase-staging-auth.mjs";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("staging activation safeguards", () => {
  it("disabled media cannot initialize Firebase or call any Storage API", () => {
    vi.stubEnv("CINEBITE_STORAGE_ENABLED", "false");
    expect(() => getAdminStorageBucket()).toThrow(expect.objectContaining({ code: "MEDIA_STORAGE_DISABLED", status: 503 }));
    expect(getStorage).not.toHaveBeenCalled();
    expect(getServerEnv).not.toHaveBeenCalled();
  });
  it("retains existing unset/true local policy and rejects malformed flags", () => {
    expect(() => assertMediaStorageEnabled({})).not.toThrow();
    expect(() => assertMediaStorageEnabled({ CINEBITE_STORAGE_ENABLED: "true" })).not.toThrow();
    for (const value of ["", "TRUE", "enabled"])
      expect(() => assertMediaStorageEnabled({ CINEBITE_STORAGE_ENABLED: value })).toThrow();
  });
  const project = STAGING_FIREBASE_PROJECT;
  function transport(billingEnabled = false, configured = true) {
    return vi.fn(async (method: string, url: string) => {
      if (url.endsWith(`/v1beta1/projects/${project}`)) return { status: 200, body: { projectId: project, state: "ACTIVE" } };
      if (url.endsWith("/billingInfo")) return { status: 200, body: { billingEnabled } };
      if (url.endsWith("/webApps")) return { status: 200, body: { apps: [{ displayName: "CineBite Staging Web", state: "ACTIVE", appId: "synthetic-app" }] } };
      if (method === "POST") return { status: 403, body: { error: { message: "private provider diagnostic must not escape" } } };
      return configured ? { status: 200, body: { signIn: { email: { enabled: true, passwordRequired: true } } } } : { status: 404, body: {} };
    });
  }
  it("read-only verification never mutates Auth, billing or storage", async () => {
    const request = transport();
    expect(await activateStagingAuth({ request })).toMatchObject({ status: "PASS", billingEnabled: false, emailPasswordEnabled: true });
    expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
  });
  it("billing-enabled projects are refused before activation", async () => {
    const request = transport(true, false);
    expect(await activateStagingAuth({ request, enable: true })).toMatchObject({ status: "BLOCKED", billingEnabled: true });
    expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
  });
  it("requests only ordinary email/password on an existing staging app, with no upgrades or credential diagnostics", async () => {
    const request = transport(false, false);
    const result = await activateStagingAuth({ request, enable: true });
    expect(result).toMatchObject({ status: "BLOCKED", activationHttpStatus: 403, billingEnabled: false });
    const writes = request.mock.calls.filter(([method]) => method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toBe("https://firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp");
    expect(request).toHaveBeenCalledWith("POST", writes[0][1], {
      parent: `projects/${project}`, appNamespace: "synthetic-app", webInput: {}, firebaseAuthInput: { emailAuthProviderMode: "PROVIDER_ENABLED" },
    });
    expect(JSON.stringify(result)).not.toContain("private provider diagnostic");
    expect(request.mock.calls.every(([, url]) => !/initializeAuth|storage|serviceAccounts/.test(url))).toBe(true);
  });
  it("rejects the wrong Firebase project before any write", async () => {
    const request = vi.fn(async () => ({ status: 200, body: { projectId: "different-project", state: "ACTIVE" } }));
    expect(await activateStagingAuth({ request, enable: true })).toMatchObject({ status: "BLOCKED" });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
