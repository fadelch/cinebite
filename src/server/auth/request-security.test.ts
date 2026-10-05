import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "@/lib/security/request-origin";

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("accepts an exact request URL origin", () => {
    expect(isSameOriginRequest(request("http://localhost:3000/api/auth/session", {
      origin: "http://localhost:3000",
    }))).toBe(true);
  });

  it("accepts a LAN origin when Next constructed the URL with its bind hostname", () => {
    expect(isSameOriginRequest(request("http://localhost:3000/api/auth/session", {
      origin: "http://192.168.10.111:3000",
      host: "192.168.10.111:3000",
    }))).toBe(true);
  });

  it("uses forwarded host and protocol behind a trusted deployment proxy", () => {
    expect(isSameOriginRequest(request("http://127.0.0.1:3000/api/auth/session", {
      origin: "https://cinebite.example.com",
      host: "127.0.0.1:3000",
      "x-forwarded-host": "cinebite.example.com",
      "x-forwarded-proto": "https",
    }))).toBe(true);
  });

  it("rejects cross-origin, missing, null, and malformed origins", () => {
    expect(isSameOriginRequest(request("http://localhost:3000/api/auth/session", {
      origin: "http://attacker.example",
      host: "localhost:3000",
    }))).toBe(false);
    expect(isSameOriginRequest(request("http://localhost:3000/api/auth/session"))).toBe(false);
    expect(isSameOriginRequest(request("http://localhost:3000/api/auth/session", { origin: "null" }))).toBe(false);
    expect(isSameOriginRequest(request("http://localhost:3000/api/auth/session", { origin: "not a url" }))).toBe(false);
  });

  it("rejects a forwarded protocol mismatch", () => {
    expect(isSameOriginRequest(request("http://127.0.0.1:3000/api/auth/session", {
      origin: "http://cinebite.example.com",
      "x-forwarded-host": "cinebite.example.com",
      "x-forwarded-proto": "https",
    }))).toBe(false);
  });
});
