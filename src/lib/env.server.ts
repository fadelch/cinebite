import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().email(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url().startsWith("postgres"),
  DIRECT_URL: z.string().url().startsWith("postgres"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const result = serverEnvSchema.safeParse({
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });

  if (!result.success) {
    const invalidVariables = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");

    throw new Error(
      `Missing or invalid server environment variables: ${invalidVariables}. Check .env.local or your Vercel project settings.`,
    );
  }

  cachedServerEnv = {
    ...result.data,
    FIREBASE_ADMIN_PRIVATE_KEY:
      result.data.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };

  return cachedServerEnv;
}
