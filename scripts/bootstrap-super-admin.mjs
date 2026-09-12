import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

const emailSchema = z.email().max(254);
const environmentSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.email(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
});

const emailResult = emailSchema.safeParse(process.argv[2]);

if (!emailResult.success) {
  console.error(
    "Usage: npm run bootstrap:super-admin -- user@example.com",
  );
  process.exitCode = 1;
} else {
  const environmentResult = environmentSchema.safeParse({
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  });

  if (!environmentResult.success) {
    const invalidVariables = environmentResult.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");

    console.error(`Missing or invalid environment variables: ${invalidVariables}`);
    process.exitCode = 1;
  } else {
    const environment = environmentResult.data;
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId: environment.FIREBASE_ADMIN_PROJECT_ID,
            clientEmail: environment.FIREBASE_ADMIN_CLIENT_EMAIL,
            privateKey: environment.FIREBASE_ADMIN_PRIVATE_KEY.replace(
              /\\n/g,
              "\n",
            ),
          }),
        });
    const auth = getAuth(app);
    const firestore = getFirestore(app);

    try {
      const authUser = await auth.getUserByEmail(emailResult.data);

      if (authUser.disabled) {
        throw new Error("The Firebase Authentication user is disabled.");
      }

      await auth.setCustomUserClaims(authUser.uid, {
        role: "SUPER_ADMIN",
        organizationId: null,
      });

      const profileReference = firestore.collection("users").doc(authUser.uid);

      await firestore.runTransaction(async (transaction) => {
        const existingProfile = await transaction.get(profileReference);
        const timestamp = FieldValue.serverTimestamp();
        const profile = {
          email: authUser.email ?? emailResult.data,
          displayName:
            authUser.displayName ?? authUser.email?.split("@")[0] ?? "Super Admin",
          role: "SUPER_ADMIN",
          organizationId: null,
          locationIds: [],
          allLocations: false,
          active: true,
          updatedAt: timestamp,
          ...(existingProfile.exists ? {} : { createdAt: timestamp }),
        };

        transaction.set(profileReference, profile, { merge: true });
      });

      console.log(`SUPER_ADMIN configured for ${emailResult.data}.`);
      console.log("Sign in again to receive refreshed custom claims.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      console.error(`Bootstrap failed: ${message}`);
      process.exitCode = 1;
    }
  }
}
