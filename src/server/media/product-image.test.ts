import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminStorageBucket: vi.fn() }));

import { createProductImagePath, MAX_PRODUCT_IMAGE_BYTES, normalizeProductImage } from "@/server/media/product-image";

describe("product image safety", () => {
  it("creates a server-generated, tenant-organized WebP path", () => {
    const first = createProductImagePath("org-1", "product-1");
    const second = createProductImagePath("org-1", "product-1");
    expect(first).toMatch(/^organizations\/org-1\/products\/product-1\/[0-9a-f-]+\.webp$/);
    expect(second).not.toBe(first);
  });

  it("rejects path traversal identifiers", () => {
    expect(() => createProductImagePath("../org", "product-1")).toThrow();
  });

  it("validates content and converts approved raster input to bounded WebP", async () => {
    const png = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#f4b942" } }).png().toBuffer();
    const output = await normalizeProductImage(new File([png], "misleading.bin", { type: "application/octet-stream" }));
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(600);
  });

  it("rejects SVG/HTML and unknown binary content", async () => {
    await expect(normalizeProductImage(new File(["<svg></svg>"], "attack.svg", { type: "image/svg+xml" }))).rejects.toMatchObject({ code: "IMAGE_UPLOAD_INVALID" });
    await expect(normalizeProductImage(new File(["not an image"], "photo.png", { type: "image/png" }))).rejects.toMatchObject({ code: "IMAGE_UPLOAD_INVALID" });
  });

  it("rejects files over the configured 5 MB boundary before decoding", async () => {
    const oversized = { size: MAX_PRODUCT_IMAGE_BYTES + 1, arrayBuffer: vi.fn() } as unknown as File;
    await expect(normalizeProductImage(oversized)).rejects.toMatchObject({ code: "IMAGE_UPLOAD_INVALID" });
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
  });
});
