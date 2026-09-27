import "server-only";

import { randomUUID } from "node:crypto";

import { getDownloadURL } from "firebase-admin/storage";

import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { normalizeProductImage } from "@/server/media/product-image";
import { ServiceError } from "@/server/services/service-error";
import { documentIdSchema } from "@/validation/shared";

export interface StoredMoviePoster { storagePath: string; url: string }

export function createMoviePosterPath(organizationIdInput: string, movieIdInput: string) {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const movieId = documentIdSchema.parse(movieIdInput);
  return `organizations/${organizationId}/movies/${movieId}/${randomUUID()}.webp`;
}

export async function storeMoviePoster(organizationId: string, movieId: string, file: File): Promise<StoredMoviePoster> {
  const contents = await normalizeProductImage(file);
  const storagePath = createMoviePosterPath(organizationId, movieId);
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
    console.error("[movies/media] Poster storage failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    throw new ServiceError("POSTER_STORAGE_UNAVAILABLE", 503, "Movie poster storage is temporarily unavailable.");
  }
}

export async function deleteMoviePoster(organizationIdInput: string, movieIdInput: string, storagePath: string) {
  const organizationId = documentIdSchema.parse(organizationIdInput);
  const movieId = documentIdSchema.parse(movieIdInput);
  const prefix = `organizations/${organizationId}/movies/${movieId}/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes("..")) return;
  await getAdminStorageBucket().file(storagePath).delete({ ignoreNotFound: true });
}
