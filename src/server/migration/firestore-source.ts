import "server-only";

import type {
  LegacyFirestoreSource,
  LegacyHallDocument,
  LegacyLocationDocument,
  LegacySeatDocument,
} from "@/server/migration/firestore-to-postgres";
import { getAdminFirestore } from "@/lib/firebase/admin";

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

  return {
    organizations: organizationSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    })),
    locations: locationTrees.map(({ location }) => location),
    halls: hallTrees.map(({ hall }) => hall),
    seats: hallTrees.flatMap(({ seats }) => seats),
    users: userSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    })),
    auditLogs: auditSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    })),
  };
}
