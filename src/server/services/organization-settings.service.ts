import { log } from "@/lib/observability/logger";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  settingsActor,
  settingsScope,
  settingsConflict,
} from "./settings-context";
import {
  organizationSettingsSchema,
  brandingSettingsSchema,
  logoChangeSchema,
  locationSettingsSchema,
} from "@/validation/settings";
import {
  storeOrganizationLogo,
  deleteOrganizationLogo,
} from "@/server/media/organization-logo";
import { documentIdSchema } from "@/validation/shared";
import { ServiceError } from "./service-error";
import type {
  PublicBranding,
  OrganizationSettingsDto,
  LocationSettingsDto,
} from "@/types/settings";
import type { Organization } from "@/generated/prisma/client";
export function publicBranding(org: Organization): PublicBranding {
  return {
    name: org.customerFacingName || org.name,
    logoUrl: org.logoStoragePath
      ? `/api/branding/${encodeURIComponent(org.id)}/logo?v=${encodeURIComponent(org.logoStoragePath.split("/").at(-1)!)}`
      : null,
    accent: org.brandAccent,
    supportEmail: org.supportEmail,
    supportPhone: org.supportPhone,
    website: org.website,
  };
}
export async function getOrganizationSettings(): Promise<OrganizationSettingsDto> {
  const actor = await settingsActor();
  return prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor),
      org = scope.organization;
    const locations = await tx.location.findMany({
      where: {
        organizationId: org.id,
        ...(scope.role !== "CINEMA_ADMIN" && !scope.allLocations
          ? { id: { in: scope.locationAccess.map((l) => l.locationId) } }
          : {}),
      },
      select: { id: true, name: true, timezone: true },
      orderBy: { name: "asc" },
    });
    return {
      name: org.name,
      customerFacingName: org.customerFacingName,
      supportEmail: org.supportEmail,
      supportPhone: org.supportPhone,
      website: org.website,
      accent: org.brandAccent,
      logoUrl: publicBranding(org).logoUrl,
      version: org.settingsVersion,
      canEdit: scope.role === "CINEMA_ADMIN",
      locations,
    };
  });
}
export async function updateOrganizationSettings(input: unknown) {
  const actor = await settingsActor(true),
    { version, ...data } = organizationSettingsSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true, true);
    const result = await tx.organization.updateMany({
      where: { id: scope.organizationId, settingsVersion: version },
      data: { ...data, settingsVersion: { increment: 1 } },
    });
    if (!result.count) throw settingsConflict();
    await tx.auditLog.create({
      data: {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        action: "ORGANIZATION_SETTINGS_UPDATED",
        entityType: "ORGANIZATION",
        entityId: scope.organizationId,
        metadata: { fields: Object.keys(data), version: version + 1 },
      },
    });
  });
  return getOrganizationSettings();
}
export async function updateBrandingSettings(input: unknown) {
  const actor = await settingsActor(true),
    { accent, version } = brandingSettingsSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true, true);
    if (scope.organization.settingsVersion !== version)
      throw settingsConflict();
    await tx.organization.update({
      where: { id: scope.organizationId },
      data: { brandAccent: accent, settingsVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        action: "ORGANIZATION_BRANDING_UPDATED",
        entityType: "ORGANIZATION",
        entityId: scope.organizationId,
        metadata: {
          previousAccent: scope.organization.brandAccent,
          newAccent: accent,
          version: version + 1,
        },
      },
    });
  });
  return getOrganizationSettings();
}
export async function replaceOrganizationLogo(
  input: unknown,
  file: File | null,
) {
  const actor = await settingsActor(true),
    { version } = logoChangeSchema.parse(input);
  // Check current ownership/revision before processing/upload; transaction checks again.
  const current = await getOrganizationSettings();
  if (current.version !== version) throw settingsConflict();
  const uploaded = file
    ? await storeOrganizationLogo(actor.organizationId!, file)
    : null;
  let oldPath: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const scope = await settingsScope(tx, actor, true, true);
      if (scope.organization.settingsVersion !== version)
        throw settingsConflict();
      oldPath = scope.organization.logoStoragePath;
      await tx.organization.update({
        where: { id: scope.organizationId },
        data: { logoStoragePath: uploaded, settingsVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: scope.userId,
          organizationId: scope.organizationId,
          action: "ORGANIZATION_BRANDING_UPDATED",
          entityType: "ORGANIZATION",
          entityId: scope.organizationId,
          metadata: {
            logo: file ? "REPLACED" : "REMOVED",
            version: version + 1,
          },
        },
      });
    });
  } catch (error) {
    if (uploaded)
      await deleteOrganizationLogo(actor.organizationId!, uploaded).catch(
        () => undefined,
      );
    throw error;
  }
  if (oldPath)
    await deleteOrganizationLogo(actor.organizationId!, oldPath).catch(() => {
      log("warn","src.server.services.organization.settings.service.ts.failure",{});
    });
  return getOrganizationSettings();
}
export async function getLocationSettings(
  idInput: string,
): Promise<LocationSettingsDto> {
  const actor = await settingsActor(),
    id = documentIdSchema.parse(idInput);
  return prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor);
    if (
      scope.role !== "CINEMA_ADMIN" &&
      !scope.allLocations &&
      !scope.locationAccess.some((l) => l.locationId === id)
    )
      throw new ServiceError(
        "LOCATION_ACCESS_DENIED",
        403,
        "This location is outside your permitted scope.",
      );
    const row = await tx.location.findFirst({
      where: { id, organizationId: scope.organizationId },
    });
    if (!row)
      throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
    return {
      id: row.id,
      name: row.name,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      postalCode: row.postalCode,
      city: row.city,
      country: row.country,
      timezone: row.timezone,
      version: row.settingsVersion,
      canEdit: scope.role === "CINEMA_ADMIN",
    };
  });
}
export async function updateLocationSettings(idInput: string, input: unknown) {
  const actor = await settingsActor(true),
    id = documentIdSchema.parse(idInput),
    { version, confirmTimezoneChange, ...data } =
      locationSettingsSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true, true);
    const row = await tx.location.findFirst({
      where: { id, organizationId: scope.organizationId },
    });
    if (!row)
      throw new ServiceError("LOCATION_NOT_FOUND", 404, "Location not found.");
    if (row.settingsVersion !== version) throw settingsConflict();
    if (row.timezone !== data.timezone && !confirmTimezoneChange)
      throw new ServiceError(
        "STAFF_CONFIRMATION_REQUIRED",
        400,
        "Confirm the timezone change. Historical UTC timestamps will not be rewritten.",
      );
    await tx.location.update({
      where: { id },
      data: { ...data, settingsVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        locationId: id,
        action: "LOCATION_SETTINGS_UPDATED",
        entityType: "LOCATION",
        entityId: id,
        metadata: {
          previousTimezone: row.timezone,
          newTimezone: data.timezone,
          version: version + 1,
        },
      },
    });
  });
  return getLocationSettings(id);
}
