import "server-only";

import { randomUUID } from "node:crypto";

import { getDownloadURL } from "firebase-admin/storage";
import sharp from "sharp";

import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { ServiceError } from "@/server/services/service-error";
import { documentIdSchema } from "@/validation/shared";

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const allowedFormats = new Set(["jpeg", "png", "webp"]);

export interface StoredProductImage { storagePath: string; url: string }

export async function normalizeProductImage(file: File): Promise<Buffer> {
  if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ServiceError("IMAGE_UPLOAD_INVALID", 400, "Choose a JPEG, PNG, or WebP image no larger than 5 MB.");
  }
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const processor = sharp(input, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await processor.metadata();
    if (!metadata.format || !allowedFormats.has(metadata.format)) throw new Error("unsupported format");
    return await processor.autoOrient().resize(1200, 1200, {
      fit: "inside",
      withoutEnlargement: true,
    }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw new ServiceError("IMAGE_UPLOAD_INVALID", 400, "The uploaded file is not a safe JPEG, PNG, or WebP image.");
  }
}

export function createProductImagePath(organizationIdInput: string, productIdInput: string) {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const productId = documentIdSchema.parse(productIdInput);
  return `organizations/${organizationId}/products/${productId}/${randomUUID()}.webp`;
}

export async function storeProductImage(
  organizationId: string,
  productId: string,
  file: File,
): Promise<StoredProductImage> {
  const contents = await normalizeProductImage(file);
  const storagePath = createProductImagePath(organizationId, productId);
  const token = randomUUID();
  try {
    const object = getAdminStorageBucket().file(storagePath);
    try {
      await object.save(contents, {
        resumable: false,
        metadata: {
          contentType: "image/webp",
          cacheControl: "public,max-age=31536000,immutable",
          metadata: { firebaseStorageDownloadTokens: token },
        },
        validation: "crc32c",
      });
      return { storagePath, url: await getDownloadURL(object) };
    } catch (error) {
      await object.delete({ ignoreNotFound: true }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("[menu/media] Product image storage failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined,
    });
    throw new ServiceError(
      "IMAGE_STORAGE_UNAVAILABLE",
      503,
      "Product image storage is not available yet. Create the product without an image, then add one after Firebase Storage is configured.",
    );
  }
}

export async function deleteProductImage(
  organizationIdInput: string,
  productIdInput: string,
  storagePath: string,
) {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const productId = documentIdSchema.parse(productIdInput);
  const prefix = `organizations/${organizationId}/products/${productId}/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes("..")) return;
  await getAdminStorageBucket().file(storagePath).delete({ ignoreNotFound: true });
}
