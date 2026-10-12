import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAdminAuth } from "@/lib/firebase/admin";
import { settingsActor, settingsScope } from "./settings-context";
import { ServiceError } from "./service-error";
import {
  staffListSchema,
  inviteStaffSchema,
  editStaffSchema,
  staffStatusSchema,
  staffSetupSchema,
} from "@/validation/settings";
import { documentIdSchema } from "@/validation/shared";
import { changedLocations, protectLastAdmin } from "@/lib/staff/policy";
import { synchronizeStaffIdentity } from "./staff-identity.service";
import type { StaffDto, StaffListDto } from "@/types/settings";
const relations = {
  user: { include: { memberships: { select: { organizationId: true } } } },
  locationAccess: {
    include: { location: { select: { id: true, name: true } } },
  },
} as const;
type Member = Prisma.OrganizationMembershipGetPayload<{
  include: typeof relations;
}>;
function dto(row: Member, actorUid: string): StaffDto {
  return {
    id: row.userId,
    displayName: row.user.displayName,
    email: row.user.email,
    role: row.role,
    status: !row.user.active
      ? "SUSPENDED"
      : row.user.setupState === "INVITED"
        ? "INVITED"
        : "ACTIVE",
    locations: row.locationAccess.map((l) => l.location),
    organizationWide: row.role === "CINEMA_ADMIN" || row.allLocations,
    revision: row.revision,
    joinedAt: row.createdAt.toISOString(),
    identitySyncPending: row.user.identitySyncPending,
    canManage:
      row.user.platformRole === "USER" && row.user.memberships.length === 1,
    self: row.user.firebaseUid === actorUid,
  };
}
function conflict() {
  return new ServiceError(
    "STAFF_CONFLICT",
    409,
    "This staff record changed. Reload and review the current role/access before saving.",
  );
}
async function target(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
) {
  const row = await tx.organizationMembership.findFirst({
    where: { organizationId, userId, user: { platformRole: "USER" } },
    include: relations,
  });
  if (!row)
    throw new ServiceError("STAFF_NOT_FOUND", 404, "Staff member not found.");
  return row;
}
function manageable(row: Member) {
  if (row.user.memberships.length !== 1)
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Shared legacy identities cannot be changed through tenant staff administration.",
    );
}
async function verifyLocations(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ids: string[],
) {
  const count = await tx.location.count({
    where: { organizationId, id: { in: ids }, status: "ACTIVE" },
  });
  if (count !== ids.length)
    throw new ServiceError(
      "LOCATION_ACCESS_DENIED",
      403,
      "Choose only active locations belonging to your cinema.",
    );
}
async function lastAdmin(
  tx: Prisma.TransactionClient,
  row: Member,
  next: { role: string; active: boolean },
) {
  const count = await tx.organizationMembership.count({
    where: {
      organizationId: row.organizationId,
      role: "CINEMA_ADMIN",
      user: { active: true, setupState: "READY", platformRole: "USER" },
    },
  });
  if (
    protectLastAdmin(
      {
        role: row.role,
        active: row.user.active,
        ready: row.user.setupState === "READY",
      },
      next,
      count,
    )
  )
    throw new ServiceError(
      "STAFF_LAST_ADMIN",
      409,
      "At least one active Cinema Admin is required.",
    );
}
async function staffEvent(
  tx: Prisma.TransactionClient,
  row: Member,
  type: "STAFF_ROLE_CHANGED" | "STAFF_ACCESS_CHANGED",
  payload: Record<string, string>,
) {
  const location = await tx.location.findFirst({
    where: {
      organizationId: row.organizationId,
      status: "ACTIVE",
      ...(row.role === "CINEMA_ADMIN" || row.allLocations
        ? {}
        : { id: { in: row.locationAccess.map((l) => l.locationId) } }),
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (location)
    await tx.notificationOutbox.create({
      data: {
        eventKey: `staff:${type}:${row.id}:${row.revision}`,
        type,
        organizationId: row.organizationId,
        locationId: location.id,
        entityType: "USER",
        entityId: row.userId,
        payload,
      },
    });
}
export async function listStaff(input: unknown = {}): Promise<StaffListDto> {
  const actor = await settingsActor(true),
    query = staffListSchema.parse(input),
    pageSize = 20;
  return prisma.$transaction(
    async (tx) => {
      const scope = await settingsScope(tx, actor, true);
      if (
        query.locationId &&
        !(await tx.location.findFirst({
          where: { id: query.locationId, organizationId: scope.organizationId },
          select: { id: true },
        }))
      )
        throw new ServiceError(
          "LOCATION_ACCESS_DENIED",
          403,
          "This location is outside your cinema.",
        );
      const where: Prisma.OrganizationMembershipWhereInput = {
        organizationId: scope.organizationId,
        ...(query.role ? { role: query.role } : {}),
        ...(query.locationId
          ? {
              OR: [
                { role: "CINEMA_ADMIN" },
                { allLocations: true },
                { locationAccess: { some: { locationId: query.locationId } } },
              ],
            }
          : {}),
        user: {
          platformRole: "USER",
          ...(query.status === "SUSPENDED"
            ? { active: false }
            : query.status
              ? {
                  active: true,
                  setupState: query.status === "INVITED" ? "INVITED" : "READY",
                }
              : {}),
          ...(query.search
            ? {
                OR: [
                  {
                    displayName: {
                      contains: query.search,
                      mode: "insensitive",
                    },
                  },
                  { email: { contains: query.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
      };
      const [items, total, locations] = await Promise.all([
        tx.organizationMembership.findMany({
          where,
          include: relations,
          orderBy: [{ user: { displayName: "asc" } }, { id: "asc" }],
          skip: (query.page - 1) * pageSize,
          take: pageSize,
        }),
        tx.organizationMembership.count({ where }),
        tx.location.findMany({
          where: { organizationId: scope.organizationId, status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);
      return {
        items: items.map((row) => dto(row, actor.uid)),
        total,
        page: query.page,
        pageSize,
        locations,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getStaff(idInput: string): Promise<StaffDto> {
  const actor = await settingsActor(true),
    id = documentIdSchema.parse(idInput);
  return prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true),
      row = await target(tx, scope.organizationId, id);
    const events = await tx.auditLog.findMany({
      where: {
        organizationId: scope.organizationId,
        entityType: "USER",
        entityId: id,
        action: {
          in: [
            "STAFF_INVITED",
            "STAFF_ROLE_CHANGED",
            "STAFF_LOCATION_ACCESS_CHANGED",
            "STAFF_SUSPENDED",
            "STAFF_REACTIVATED",
            "STAFF_PROFILE_UPDATED",
            "STAFF_SETUP_RESTARTED",
          ],
        },
      },
      include: { actor: { select: { displayName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    return {
      ...dto(row, actor.uid),
      audits: events.map((event) => {
        const p = event.metadata as Record<string, string>;
        return {
          id: event.id,
          action: event.action,
          actor: event.actor?.displayName ?? "Cinema administrator",
          createdAt: event.createdAt.toISOString(),
          summary:
            event.action === "STAFF_ROLE_CHANGED"
              ? `${p.previousRole} → ${p.newRole}`
              : event.action === "STAFF_LOCATION_ACCESS_CHANGED"
                ? "Authorized location grants updated."
                : event.action === "STAFF_SETUP_RESTARTED"
                  ? "A private setup link was generated; no email delivery is claimed."
                  : "Staff lifecycle change recorded.",
        };
      }),
    };
  });
}
export async function inviteStaff(input: unknown) {
  const actor = await settingsActor(true),
    data = inviteStaffSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true);
    await verifyLocations(tx, scope.organizationId, data.locationIds);
    if (
      await tx.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      })
    )
      throw new ServiceError(
        "STAFF_CONFLICT",
        409,
        "This identity already exists. Use the existing staff record or ask the platform administrator to review it.",
      );
  });
  const auth = getAdminAuth();
  let uid: string | undefined,
    committed = false;
  try {
    try {
      await auth.getUserByEmail(data.email);
      throw new ServiceError(
        "STAFF_CONFLICT",
        409,
        "An Authentication identity already exists. Automatic identity linking is not permitted.",
      );
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if ((error as { code?: string }).code !== "auth/user-not-found")
        throw error;
    }
    const identity = await auth.createUser({
      email: data.email,
      displayName: data.displayName,
      disabled: false,
    });
    uid = identity.uid;
    await auth.setCustomUserClaims(uid, {
      role: data.role,
      organizationId: actor.organizationId,
      authorizationVersion: 0,
    });
    const setupLink = await auth.generatePasswordResetLink(data.email);
    const userId = await prisma.$transaction(async (tx) => {
      const scope = await settingsScope(tx, actor, true, true);
      await verifyLocations(tx, scope.organizationId, data.locationIds);
      const user = await tx.user.create({
        data: {
          firebaseUid: uid!,
          email: data.email,
          displayName: data.displayName,
          active: true,
          setupState: "INVITED",
          memberships: {
            create: {
              organizationId: scope.organizationId,
              role: data.role,
              allLocations: data.role === "CINEMA_ADMIN",
              locationAccess: {
                create: data.locationIds.map((locationId) => ({
                  locationId,
                })),
              },
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: scope.userId,
          organizationId: scope.organizationId,
          action: "STAFF_INVITED",
          entityType: "USER",
          entityId: user.id,
          metadata: {
            role: data.role,
            locationCount: data.locationIds.length,
            setupState: "INVITED",
            delivery: "MANUAL_PRIVATE_LINK",
          },
        },
      });
      return user.id;
    });
    committed = true;
    return {
      staff: await getStaff(userId),
      setupLink,
      delivery: "MANUAL_PRIVATE_LINK" as const,
    };
  } catch (error) {
    if (
      uid &&
      !committed &&
      !(await prisma.user.findUnique({
        where: { firebaseUid: uid },
        select: { id: true },
      }))
    )
      await auth.deleteUser(uid).catch(() => {
        console.warn(
          "[staff] New identity compensation requires operator review.",
        );
      });
    if (error instanceof ServiceError) throw error;
    if (
      (error as { code?: string }).code === "auth/email-already-exists" ||
      (error as { code?: string }).code === "P2002"
    )
      throw new ServiceError(
        "STAFF_CONFLICT",
        409,
        "This identity was already invited or exists. Review the current staff list before retrying.",
      );
    throw new ServiceError(
      "STAFF_PROVISION_FAILED",
      503,
      "Staff setup could not be completed. No existing member's credentials were changed. Retry after reviewing the staff list.",
    );
  }
}
export async function editStaff(idInput: string, input: unknown) {
  const actor = await settingsActor(true),
    id = documentIdSchema.parse(idInput),
    data = editStaffSchema.parse(input);
  const sync = await prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true, true),
      row = await target(tx, scope.organizationId, id);
    manageable(row);
    if (row.revision !== data.revision) throw conflict();
    await verifyLocations(tx, scope.organizationId, data.locationIds);
    await lastAdmin(tx, row, { role: data.role, active: row.user.active });
    if (row.userId === scope.userId && row.role !== data.role)
      throw new ServiceError(
        "STAFF_SELF_CHANGE",
        409,
        "Changing your own role is not allowed.",
      );
    const roleChanged = row.role !== data.role,
      accessChanged =
        changedLocations(
          row.locationAccess.map((l) => l.locationId),
          data.locationIds,
        ) || row.allLocations !== (data.role === "CINEMA_ADMIN");
    if (roleChanged && !data.confirmedRoleChange)
      throw new ServiceError(
        "STAFF_CONFIRMATION_REQUIRED",
        400,
        "Confirm the role change and review the resulting permissions.",
      );
    await tx.user.update({
      where: { id },
      data: {
        displayName: data.displayName,
        ...(roleChanged
          ? {
              authorizationVersion: { increment: 1 },
              identitySyncPending: true,
            }
          : {}),
      },
    });
    await tx.locationAccess.deleteMany({ where: { membershipId: row.id } });
    await tx.organizationMembership.update({
      where: { id: row.id },
      data: {
        role: data.role,
        allLocations: data.role === "CINEMA_ADMIN",
        revision: { increment: 1 },
        locationAccess: {
          create: data.locationIds.map((locationId) => ({
            locationId,
          })),
        },
      },
    });
    const audit = {
      actorUserId: scope.userId,
      organizationId: scope.organizationId,
      entityType: "USER" as const,
      entityId: id,
    };
    if (roleChanged)
      await tx.auditLog.create({
        data: {
          ...audit,
          action: "STAFF_ROLE_CHANGED",
          metadata: {
            previousRole: row.role,
            newRole: data.role,
            revision: data.revision + 1,
          },
        },
      });
    if (accessChanged)
      await tx.auditLog.create({
        data: {
          ...audit,
          action: "STAFF_LOCATION_ACCESS_CHANGED",
          metadata: {
            previousLocations: row.locationAccess.map((l) => l.locationId),
            newLocations: data.locationIds,
            organizationWide: data.role === "CINEMA_ADMIN",
          },
        },
      });
    if (row.user.displayName !== data.displayName)
      await tx.auditLog.create({
        data: {
          ...audit,
          action: "STAFF_PROFILE_UPDATED",
          metadata: { displayNameChanged: true },
        },
      });
    const fresh = await target(tx, scope.organizationId, id);
    if (roleChanged)
      await staffEvent(tx, fresh, "STAFF_ROLE_CHANGED", {
        previousRole: row.role,
        newRole: data.role,
      });
    if (accessChanged) await staffEvent(tx, fresh, "STAFF_ACCESS_CHANGED", {});
    return roleChanged;
  });
  if (sync) await synchronizeStaffIdentity(id, actor.organizationId!);
  return getStaff(id);
}
export async function setStaffActive(idInput: string, input: unknown) {
  const actor = await settingsActor(true),
    id = documentIdSchema.parse(idInput),
    data = staffStatusSchema.parse(input);
  if (data.active) {
    // Do not silently override a separate Firebase/platform identity lock.
    const current = await getStaff(id);
    if (!current.canManage)
      throw new ServiceError(
        "AUTHORIZATION_DENIED",
        403,
        "This identity requires platform review.",
      );
    const identityRow = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { firebaseUid: true },
    });
    let identity;
    try {
      identity = await getAdminAuth().getUser(identityRow.firebaseUid);
    } catch {
      throw new ServiceError(
        "STAFF_IDENTITY_UNAVAILABLE",
        503,
        "The identity provider is unavailable. Reactivation has not been applied.",
      );
    }
    if (identity.disabled)
      throw new ServiceError(
        "STAFF_IDENTITY_UNAVAILABLE",
        409,
        "This identity is disabled in Firebase. Platform review is required before reactivation.",
      );
  }
  await prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true, true),
      row = await target(tx, scope.organizationId, id);
    manageable(row);
    if (row.revision !== data.revision) throw conflict();
    await lastAdmin(tx, row, { role: row.role, active: data.active });
    if (row.userId === scope.userId && !data.active)
      throw new ServiceError(
        "STAFF_SELF_CHANGE",
        409,
        "You cannot suspend your own account.",
      );
    if (row.user.active === data.active)
      throw new ServiceError(
        "STAFF_CONFLICT",
        409,
        "This staff member already has that account status.",
      );
    if (data.active && row.role !== "CINEMA_ADMIN")
      await verifyLocations(
        tx,
        scope.organizationId,
        row.locationAccess.map((l) => l.locationId),
      );
    await tx.user.update({
      where: { id },
      data: {
        active: data.active,
        authorizationVersion: { increment: 1 },
        identitySyncPending: true,
      },
    });
    await tx.organizationMembership.update({
      where: { id: row.id },
      data: { revision: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        action: data.active ? "STAFF_REACTIVATED" : "STAFF_SUSPENDED",
        entityType: "USER",
        entityId: id,
        metadata: {
          previousActive: row.user.active,
          newActive: data.active,
          role: row.role,
          revision: data.revision + 1,
        },
      },
    });
  });
  await synchronizeStaffIdentity(id, actor.organizationId!);
  return getStaff(id);
}
export async function restartStaffSetup(idInput: string, input: unknown) {
  const actor = await settingsActor(true),
    id = documentIdSchema.parse(idInput),
    data = staffSetupSchema.parse(input),
    current = await getStaff(id);
  if (!current.canManage || current.status === "SUSPENDED")
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "Account setup is unavailable for this staff member.",
    );
  if (current.revision !== data.revision) throw conflict();
  let setupLink: string;
  try {
    setupLink = await getAdminAuth().generatePasswordResetLink(current.email);
  } catch {
    throw new ServiceError(
      "STAFF_IDENTITY_UNAVAILABLE",
      503,
      "A setup link could not be generated. No email delivery is claimed.",
    );
  }
  await prisma.$transaction(async (tx) => {
    const scope = await settingsScope(tx, actor, true, true),
      row = await target(tx, scope.organizationId, id);
    manageable(row);
    if (row.revision !== data.revision) throw conflict();
    if (!row.user.active)
      throw new ServiceError(
        "AUTHORIZATION_DENIED",
        403,
        "This account is suspended.",
      );
    await tx.organizationMembership.update({
      where: { id: row.id },
      data: { revision: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: scope.userId,
        organizationId: scope.organizationId,
        action: "STAFF_SETUP_RESTARTED",
        entityType: "USER",
        entityId: id,
        metadata: { delivery: "MANUAL_PRIVATE_LINK" },
      },
    });
  });
  return {
    staff: await getStaff(id),
    setupLink,
    delivery: "MANUAL_PRIVATE_LINK" as const,
  };
}
export async function repairStaffIdentity(idInput: string) {
  const actor = await settingsActor(true),
    id = documentIdSchema.parse(idInput);
  const current = await getStaff(id);
  if (!current.canManage)
    throw new ServiceError(
      "AUTHORIZATION_DENIED",
      403,
      "This identity requires platform review.",
    );
  await synchronizeStaffIdentity(id, actor.organizationId!);
  return getStaff(id);
}
