import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminStorageBucket: vi.fn() }));
vi.mock("firebase-admin/storage", () => ({ getDownloadURL: vi.fn().mockResolvedValue("https://storage.example/poster.webp") }));

import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { createMoviePosterPath, storeMoviePoster } from "@/server/media/movie-poster";

describe("movie poster media safety", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses a server-generated tenant/movie path and rejects traversal", () => {
    expect(createMoviePosterPath("org-1", "movie-1")).toMatch(/^organizations\/org-1\/movies\/movie-1\/[0-9a-f-]+\.webp$/);
    expect(() => createMoviePosterPath("../org", "movie-1")).toThrow();
  });

  it("reuses normalized WebP storage and stable Firebase delivery", async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: "#111114" } }).png().toBuffer();
    const object = { save: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
    vi.mocked(getAdminStorageBucket).mockReturnValue({ file: vi.fn().mockReturnValue(object) } as never);
    const result = await storeMoviePoster("org-1", "movie-1", new File([image], "poster.png"));
    expect(result.storagePath).toContain("organizations/org-1/movies/movie-1/");
    expect(object.save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ metadata: expect.objectContaining({ contentType: "image/webp" }) }));
  });

  it("returns a friendly storage error without leaking credentials", async () => {
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#111114" } }).png().toBuffer();
    const object = { save: vi.fn().mockRejectedValue(new Error("bucket unavailable")), delete: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(getAdminStorageBucket).mockReturnValue({ file: vi.fn().mockReturnValue(object) } as never);
    await expect(storeMoviePoster("org-1", "movie-1", new File([image], "poster.png"))).rejects.toMatchObject({ code: "POSTER_STORAGE_UNAVAILABLE", status: 503 });
  });
});
