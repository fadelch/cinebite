import "server-only";
import { randomUUID } from "node:crypto";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { normalizeProductImage } from "./product-image";
import { documentIdSchema } from "@/validation/shared";
import { ServiceError } from "@/server/services/service-error";
export function logoPath(org: string) {
  return `organizations/${documentIdSchema.parse(org)}/branding/${randomUUID()}.webp`;
}
export function validLogoPath(org: string, path: string) {
  return (
    path.startsWith(`organizations/${documentIdSchema.parse(org)}/branding/`) &&
    /\/[0-9a-f-]+\.webp$/.test(path) &&
    !path.includes("..")
  );
}
export async function normalizeOrganizationLogo(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new ServiceError(
      "IMAGE_UPLOAD_INVALID",
      400,
      "Choose a JPEG, PNG or WebP logo (maximum 5 MB); SVG is not allowed.",
    );
  return normalizeProductImage(file);
}
export async function storeOrganizationLogo(org: string, file: File) {
  const contents = await normalizeOrganizationLogo(file),
    path = logoPath(org),
    object = getAdminStorageBucket().file(path);
  try {
    await object.save(contents, {
      resumable: false,
      metadata: {
        contentType: "image/webp",
        cacheControl: "public,max-age=31536000,immutable",
      },
      validation: "crc32c",
    });
    return path;
  } catch {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw new ServiceError(
      "IMAGE_STORAGE_UNAVAILABLE",
      503,
      "Logo storage is unavailable. Your existing branding has not been replaced.",
    );
  }
}
export async function deleteOrganizationLogo(org: string, path: string) {
  if (validLogoPath(org, path))
    await getAdminStorageBucket().file(path).delete({ ignoreNotFound: true });
}
