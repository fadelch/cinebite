// Read-only local scan. Reports categories/filenames only, never matching values.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

const root = process.cwd();
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
const privateEnv = existsSync(".env.local")
  ? parse(readFileSync(".env.local"))
  : {};
const secrets = Object.entries(privateEnv)
  .filter(
    ([key, value]) =>
      !key.startsWith("NEXT_PUBLIC_") &&
      /KEY|SECRET|TOKEN|DATABASE_URL|DIRECT_URL/.test(key) &&
      value.length >= 12 &&
      !/placeholder|replace|your-/i.test(value),
  )
  .map(([, value]) => value);
const findings = new Set();
// Include operational configuration and key/text files, not only source code.
const textPath = (name) =>
  /\.(?:tsx?|mjs|mts|cjs|cts|js|json|md|mdx|sql|prisma|example|yaml|yml|toml|txt|ini|conf|config|sh|ps1|bat|pem|key|lock)$/.test(
    name,
  ) || /(^|\/)(?:Dockerfile|\.npmrc|\.env[^/]*)$/.test(name);
const inspect = (name, text, client = false) => {
  if (
    secrets.some(
      (value) =>
        text.includes(value) ||
        text.includes(JSON.stringify(value).slice(1, -1)),
    )
  )
    findings.add(name + ": local server credential");
  if (
    /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]{100,}?-----END (?:RSA )?PRIVATE KEY-----/.test(
      text,
    )
  )
    findings.add(name + ": private key material");
  if (/\bsk_live_[A-Za-z0-9]{16,}|\bwhsec_[A-Za-z0-9]{16,}/.test(text))
    findings.add(name + ": provider credential pattern");
  if (/postgres(?:ql)?:\/\/[^\s"']*:[^\s"'@]+@[^\s"']*\.neon\.tech/.test(text))
    findings.add(name + ": database credential pattern");
  if (
    client &&
    /FIREBASE_ADMIN_PRIVATE_KEY|PAYMENT_PROVIDER_WEBHOOK_SECRET|DATABASE_URL|DIRECT_URL|SECURITY_RATE_LIMIT_SECRET/.test(
      text,
    )
  )
    findings.add(name + ": server environment name in client asset");
};
const tracked = git("ls-files").trim().split(/\r?\n/);
for (const name of tracked) {
  if (/(^|\/)\.env(?:\.|$)/.test(name) && name !== ".env.example")
    findings.add(name + ": tracked environment file");
  if (existsSync(name) && textPath(name))
    inspect(name, readFileSync(name, "utf8"));
}
// Unique reachable Git blobs: batch to avoid outputting confidential historical text.
const objects = git("rev-list", "--objects", "--all")
  .trim()
  .split(/\r?\n/)
  .map((line) => {
    const split = line.indexOf(" ");
    return [line.slice(0, split), line.slice(split + 1)];
  })
  .filter(([, name]) => textPath(name));
for (let offset = 0; offset < objects.length; offset += 100) {
  const batch = objects.slice(offset, offset + 100);
  const bytes = execFileSync("git", ["cat-file", "--batch"], {
    input: batch.map(([id]) => id).join("\n") + "\n",
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  let cursor = 0;
  for (const [, name] of batch) {
    const newline = bytes.indexOf(10, cursor),
      header = bytes.subarray(cursor, newline).toString();
    const [, , size] = header.split(" ");
    cursor = newline + 1;
    if (!size) continue;
    const text = bytes.subarray(cursor, cursor + Number(size)).toString("utf8");
    cursor += Number(size) + 1;
    if (/(^|\/)\.env(?:\.|$)/.test(name) && name !== ".env.example")
      findings.add("history/" + name + ": tracked environment file");
    inspect("history/" + name, text);
  }
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(path.join(dir, entry.name))
      : [path.join(dir, entry.name)],
  );
}
const assets = existsSync(".next/static")
  ? walk(".next/static").filter((name) => /\.(?:js|css|map|json)$/.test(name))
  : [];
for (const name of assets) inspect(name, readFileSync(name, "utf8"), true);
const ignored = git("check-ignore", ".env.local").trim() === ".env.local";
if (!ignored) findings.add(".env.local: not ignored");
console.log(
  JSON.stringify(
    {
      trackedFiles: tracked.length,
      historyObjects: objects.length,
      clientAssets: assets.length,
      environmentIgnored: ignored,
      findings: [...findings],
    },
    null,
    2,
  ),
);
process.exitCode = findings.size ? 1 : 0;
