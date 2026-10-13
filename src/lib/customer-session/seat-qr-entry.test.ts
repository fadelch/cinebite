import { expect, it } from "vitest";
import { seatQrCredentialSchema } from "@/validation/seat-qr";
import { seatQrEntryPath } from "./seat-qr-entry";

const origin = "https://example.test";
const code = "A".repeat(41) + "_-";
const path = `/s/${code}`;

it.each([code, `  ${code}\n`, path, `${origin}${path}`, `  ${origin}${path}  `])("accepts a seat code or same-site QR link", (value) => {
  expect(seatQrEntryPath(value, origin)).toBe(path);
  expect(seatQrCredentialSchema.safeParse(code).success).toBe(true);
});

it("works on the current LAN origin without hardcoding localhost or staging", () => {
  expect(seatQrEntryPath(`http://192.168.10.111:3000${path}`, "http://192.168.10.111:3000")).toBe(path);
  expect(seatQrEntryPath(`http://localhost:3000${path}`, "http://192.168.10.111:3000")).toBeNull();
});

it.each([
  "", "A".repeat(42), "A".repeat(44), "A".repeat(42) + ".", "A".repeat(42) + "é",
  `${origin}/customer/menu`, `${origin}${path}/extra`, `${path}/`, `${path}?secret=value`, `${path}#fragment`,
  `${origin}${path}?`, `${origin}${path}#`, `${origin}/s/%41${code.slice(1)}`,
  `https://other.example${path}`, `https://example.test.attacker.test${path}`,
  `http://example.test${path}`, `https://example.test:444${path}`, `//example.test${path}`,
  `https://user:password@example.test${path}`, `javascript:alert(1)`, `data:text/html,${path}`,
  `https://example.test\\${path}`, `https://exam\nple.test${path}`, "A".repeat(2049),
])("rejects malformed credentials, external links and arbitrary destinations", (value) => {
  expect(seatQrEntryPath(value, origin)).toBeNull();
});
