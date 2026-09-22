import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env.server";

const prismaGlobal = globalThis as unknown as {
  cinebitePrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({
    connectionString: getServerEnv().DATABASE_URL,
  });

  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient {
  if (!prismaGlobal.cinebitePrisma) {
    prismaGlobal.cinebitePrisma = createPrismaClient();
  }

  return prismaGlobal.cinebitePrisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
