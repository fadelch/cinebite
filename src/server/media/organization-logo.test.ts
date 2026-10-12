import sharp from "sharp";
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminStorageBucket: vi.fn() }));
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import {
  logoPath,
  validLogoPath,
  normalizeOrganizationLogo,
  storeOrganizationLogo,
  deleteOrganizationLogo,
} from "./organization-logo";
describe("organization logo boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses generated tenant-scoped branding paths and refuses foreign/traversal deletion", async () => {
    const first = logoPath("demo");
    expect(first).toMatch(/^organizations\/demo\/branding\/[0-9a-f-]+\.webp$/);
    expect(first).not.toBe(logoPath("demo"));
    expect(validLogoPath("demo", first)).toBe(true);
    expect(validLogoPath("other", first)).toBe(false);
    expect(
      validLogoPath("demo", "organizations/demo/branding/../../other.webp"),
    ).toBe(false);
    await deleteOrganizationLogo("other", first);
    expect(getAdminStorageBucket).not.toHaveBeenCalled();
  });
  it("normalizes valid raster data while removing original format/metadata", async () => {
    const png = await sharp({
      create: { width: 1600, height: 800, channels: 3, background: "#1f9a8a" },
    })
      .png()
      .toBuffer();
    const result = await normalizeOrganizationLogo(
      new File([png], "demo.png", { type: "image/png" }),
    );
    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1200);
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects invalid MIME, fake contents, SVG and oversize", async () => {
    await expect(
      normalizeOrganizationLogo(
        new File(["png"], "x.png", { type: "image/png" }),
      ),
    ).rejects.toMatchObject({ code: "IMAGE_UPLOAD_INVALID" });
    await expect(
      normalizeOrganizationLogo(
        new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toMatchObject({ code: "IMAGE_UPLOAD_INVALID" });
    await expect(
      normalizeOrganizationLogo(
        new File(["data"], "x.bin", { type: "application/octet-stream" }),
      ),
    ).rejects.toMatchObject({ code: "IMAGE_UPLOAD_INVALID" });
    await expect(
      normalizeOrganizationLogo({
        size: 5 * 1024 * 1024 + 1,
        type: "image/png",
      } as File),
    ).rejects.toMatchObject({ code: "IMAGE_UPLOAD_INVALID" });
  });
  it("compensates a failed upload and does not leak provider errors", async () => {
    const object = {
      save: vi.fn().mockRejectedValue(new Error("private provider content")),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getAdminStorageBucket).mockReturnValue({
      file: vi.fn().mockReturnValue(object),
    } as never);
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#111111" },
    })
      .png()
      .toBuffer();
    await expect(
      storeOrganizationLogo(
        "demo",
        new File([png], "logo.png", { type: "image/png" }),
      ),
    ).rejects.toMatchObject({ code: "IMAGE_STORAGE_UNAVAILABLE" });
    expect(object.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});
