import "server-only";

import QRCode from "qrcode";

import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { documentIdSchema } from "@/validation/shared";

function safeSegment(value: string): string {
  return documentIdSchema.parse(value);
}

export function getCineBitePublicOrigin(): string {
  const configured = process.env.CINEBITE_APP_ORIGIN?.trim();
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("CINEBITE_APP_ORIGIN must use HTTPS in production.");
    }
    return url.origin;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV === "production") throw new Error("CINEBITE_APP_ORIGIN is required in production.");
  return "http://localhost:3000";
}

export function seatQrImagePath(input: {
  organizationId: string;
  locationId: string;
  hallId: string;
  seatId: string;
  version: number;
}) {
  const organizationId = safeSegment(input.organizationId);
  const locationId = safeSegment(input.locationId);
  const hallId = safeSegment(input.hallId);
  const seatId = safeSegment(input.seatId);
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw new Error("Invalid QR version.");
  return `organizations/${organizationId}/locations/${locationId}/halls/${hallId}/seats/${seatId}/qr-v${input.version}.png`;
}

export async function createSeatQrPng(credential: string): Promise<Buffer> {
  const scanUrl = new URL(`/s/${credential}`, getCineBitePublicOrigin()).toString();
  return QRCode.toBuffer(scanUrl, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 720,
    color: { dark: "#09090B", light: "#FFFFFF" },
  });
}

export async function storeSeatQrImage(storagePath: string, png: Buffer): Promise<void> {
  await getAdminStorageBucket().file(storagePath).save(png, {
    resumable: false,
    validation: "crc32c",
    metadata: { contentType: "image/png", cacheControl: "private,no-store,max-age=0" },
  });
}

export async function readSeatQrImage(storagePath: string): Promise<Buffer> {
  if (!storagePath.startsWith("organizations/") || !storagePath.endsWith(".png") || storagePath.includes("..")) {
    throw new Error("Invalid QR image path.");
  }
  const [contents] = await getAdminStorageBucket().file(storagePath).download();
  return contents;
}

export async function deleteSeatQrImage(storagePath: string): Promise<void> {
  if (!storagePath.startsWith("organizations/") || !storagePath.endsWith(".png") || storagePath.includes("..")) return;
  await getAdminStorageBucket().file(storagePath).delete({ ignoreNotFound: true });
}
