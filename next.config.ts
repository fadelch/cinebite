import type { NextConfig } from "next";
import { validateEnvironment } from "./src/lib/operations/environment";

if (process.env.VERCEL === "1" || process.env.CINEBITE_ENVIRONMENT)
  validateEnvironment();
const release =
  process.env.OBSERVABILITY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;
const buildRelease =
  release && /^[a-f0-9]{40}$/.test(release) ? release : "local-unversioned";

function configuredDevOriginHosts(): string[] {
  const configuredOrigin = process.env.CINEBITE_APP_ORIGIN?.trim();
  if (!configuredOrigin) return [];
  try {
    return [new URL(configuredOrigin).hostname];
  } catch {
    return [];
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  env: { CINEBITE_BUILD_RELEASE: buildRelease }, // Only a safe SHA, never configuration/secrets.
  // Let Vercel assign a unique ID for each deploy (including same-SHA retries).
  // Self-hosted instances retain a bounded, shared cache/skew identifier.
  // The authenticated release evidence above always keeps the full commit SHA.
  ...(process.env.VERCEL === "1" ? {} : { deploymentId: buildRelease.slice(0, 32) }),
  // Preserve the Neon adapter's native Node runtime in production route handlers.
  serverExternalPackages: [
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "@prisma/adapter-pg",
  ],
  allowedDevOrigins: configuredDevOriginHosts(),
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
          ? `/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/**`
          : "/v0/b/cinebite-invalid-unconfigured/o/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
