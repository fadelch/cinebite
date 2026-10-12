import { observedRoute } from "@/server/http/observed-route";
import { prisma } from "@/lib/db/prisma";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { validLogoPath } from "@/server/media/organization-logo";
import { documentIdSchema } from "@/validation/shared";
export const runtime = "nodejs";
async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const orgId = documentIdSchema.parse((await params).organizationId),
      org = await prisma.organization.findFirst({
        where: { id: orgId, status: "ACTIVE" },
        select: { logoStoragePath: true },
      });
    if (!org?.logoStoragePath || !validLogoPath(orgId, org.logoStoragePath))
      return new Response(null, { status: 404 });
    const file = getAdminStorageBucket().file(org.logoStoragePath);
    const [metadata] = await file.getMetadata();
    if (
      Number(metadata.size) > 5 * 1024 * 1024 ||
      metadata.contentType !== "image/webp"
    )
      return new Response(null, { status: 404 });
    const [contents] = await file.download();
    return new Response(new Uint8Array(contents), {
      headers: {
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public,max-age=60",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export const GET = observedRoute("GET.api.branding.organizationId.logo", GETHandler);
