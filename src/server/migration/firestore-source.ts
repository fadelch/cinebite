import "server-only";

import { createHash } from "node:crypto";

import type {
  LegacyFirestoreSource,
  LegacyHallDocument,
  LegacyLocationDocument,
  LegacySeatDocument,
} from "@/server/migration/firestore-to-postgres";
import { MigrationValidationError } from "@/server/migration/firestore-to-postgres";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";

async function loadAuthenticationUsers(userIds: string[]) {
  const authentication = getAdminAuth();
  const users = new Map<
    string,
    { email: string | null; disabled: boolean }
  >();

  for (let start = 0; start < userIds.length; start += 100) {
    const batch = userIds.slice(start, start + 100);
    const result = await authentication.getUsers(
      batch.map((uid) => ({ uid })),
    );

    if (result.notFound.length > 0) {
      const missingUid = "uid" in result.notFound[0] ? result.notFound[0].uid : "unknown";
      throw new MigrationValidationError(
        `Firestore user ${missingUid} has no matching Firebase Authentication identity.`,
      );
    }

    for (const user of result.users) {
      users.set(user.uid, {
        email: user.email?.toLowerCase() ?? null,
        disabled: user.disabled,
      });
    }
  }

  return users;
}

export async function readLegacyFirestoreSource(): Promise<LegacyFirestoreSource> {
  const firestore = getAdminFirestore();
  const [organizationSnapshot, userSnapshot, auditSnapshot] = await Promise.all([
    firestore.collection("organizations").get(),
    firestore.collection("users").get(),
    firestore.collection("auditLogs").get(),
  ]);

  const nested = await Promise.all(
    organizationSnapshot.docs.map(async (organizationDocument) => {
      const locationSnapshot = await organizationDocument.ref
        .collection("locations")
        .get();

      const locationTrees = await Promise.all(
        locationSnapshot.docs.map(async (locationDocument) => {
          const hallSnapshot = await locationDocument.ref.collection("halls").get();

          const hallTrees = await Promise.all(
            hallSnapshot.docs.map(async (hallDocument) => {
              const seatSnapshot = await hallDocument.ref.collection("seats").get();
              const seats: LegacySeatDocument[] = seatSnapshot.docs.map((seat) => ({
                id: seat.id,
                organizationId: organizationDocument.id,
                locationId: locationDocument.id,
                hallId: hallDocument.id,
                data: seat.data(),
              }));
              const hall: LegacyHallDocument = {
                id: hallDocument.id,
                organizationId: organizationDocument.id,
                locationId: locationDocument.id,
                data: hallDocument.data(),
              };

              return { hall, seats };
            }),
          );

          const location: LegacyLocationDocument = {
            id: locationDocument.id,
            organizationId: organizationDocument.id,
            data: locationDocument.data(),
          };

          return { location, hallTrees };
        }),
      );

      return locationTrees;
    }),
  );

  const locationTrees = nested.flat();
  const hallTrees = locationTrees.flatMap(({ hallTrees: trees }) => trees);
  const authenticationUsers = await loadAuthenticationUsers(
    userSnapshot.docs.map((document) => document.id),
  );
  const warnings: string[] = [];
  const users = userSnapshot.docs.map((document) => {
    const data = document.data();
    const authenticationUser = authenticationUsers.get(document.id);
    if (!authenticationUser) {
      throw new MigrationValidationError(
        `Firestore user ${document.id} has no matching Firebase Authentication identity.`,
      );
    }

    const firestoreEmail =
      typeof data.email === "string" ? data.email.toLowerCase() : null;
    const canonicalEmail =
      authenticationUser.email ??
      `legacy-${createHash("sha256").update(document.id).digest("hex").slice(0, 32)}@example.invalid`;
    if (!authenticationUser.email) {
      warnings.push(
        `User ${document.id}: Firebase Authentication has no email; PostgreSQL will preserve an inactive archival identity with a non-routable placeholder.`,
      );
    } else if (firestoreEmail !== authenticationUser.email) {
      warnings.push(
        `User ${document.id}: PostgreSQL email will use the matching Firebase Authentication identity.`,
      );
    }
    if (data.active === true && authenticationUser.disabled) {
      warnings.push(
        `User ${document.id}: PostgreSQL user will be inactive because the Firebase Authentication identity is disabled.`,
      );
    }

    return {
      id: document.id,
      data: {
        ...data,
        email: canonicalEmail,
        active:
          data.active === true &&
          !authenticationUser.disabled &&
          authenticationUser.email !== null,
      },
    };
  });
  let redundantAuditIds = 0;
  const auditLogs = auditSnapshot.docs.map((document) => {
    const data = document.data();
    if (!("id" in data)) {
      return { id: document.id, data };
    }
    if (data.id !== document.id) {
      throw new MigrationValidationError(
        `Audit log ${document.id} has a conflicting embedded ID.`,
      );
    }

    const canonicalData = { ...data };
    delete canonicalData.id;
    redundantAuditIds += 1;
    return { id: document.id, data: canonicalData };
  });
  if (redundantAuditIds > 0) {
    warnings.push(
      `${redundantAuditIds} audit log(s): matching embedded IDs were ignored in favor of their Firestore document IDs.`,
    );
  }

  return {
    organizations: organizationSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    })),
    locations: locationTrees.map(({ location }) => location),
    halls: hallTrees.map(({ hall }) => hall),
    seats: hallTrees.flatMap(({ seats }) => seats),
    users,
    auditLogs,
    warnings,
  };
}
