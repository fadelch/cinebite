import { z } from "zod";

import { getAdminAuth } from "../src/lib/firebase/admin";
import { prisma } from "../src/lib/db/prisma";

const emailResult = z.email().max(254).safeParse(process.argv[2]?.toLowerCase());

async function main(): Promise<void> {
  if (!emailResult.success) {
    console.error("Usage: npm run bootstrap:super-admin -- user@example.com");
    process.exitCode = 1;
    return;
  }

  try {
    const auth = getAdminAuth();
    const authUser = await auth.getUserByEmail(emailResult.data);

    if (authUser.disabled) {
      throw new Error("The Firebase Authentication user is disabled.");
    }

    const email = (authUser.email ?? emailResult.data).toLowerCase();
    await prisma.$transaction(async (transaction) => {
      const emailOwner = await transaction.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.firebaseUid !== authUser.uid) {
        throw new Error("That normalized email belongs to another database user.");
      }

      await transaction.user.upsert({
        where: { firebaseUid: authUser.uid },
        create: {
          firebaseUid: authUser.uid,
          email,
          displayName:
            authUser.displayName ?? authUser.email?.split("@")[0] ?? "Super Admin",
          active: true,
          platformRole: "SUPER_ADMIN",
        },
        update: {
          email,
          displayName:
            authUser.displayName ?? authUser.email?.split("@")[0] ?? "Super Admin",
          active: true,
          platformRole: "SUPER_ADMIN",
        },
      });
    });

    await auth.setCustomUserClaims(authUser.uid, {
      role: "SUPER_ADMIN",
      organizationId: null,
    });

    console.log(`SUPER_ADMIN configured for ${email}.`);
    console.log("Sign out and sign in again to refresh the Firebase session claims.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    const safeMessages = new Set([
      "The Firebase Authentication user is disabled.",
      "That normalized email belongs to another database user.",
    ]);
    if (safeMessages.has(message)) {
      console.error(`Bootstrap failed: ${message}`);
    } else {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "UNEXPECTED";
      console.error(
        `Bootstrap failed safely (${code}). Database credentials were not displayed.`,
      );
    }
    process.exitCode = 1;
  }
}

void main();
