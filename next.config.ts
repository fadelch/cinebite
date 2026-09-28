import type { NextConfig } from "next";

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
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: configuredDevOriginHosts(),
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
