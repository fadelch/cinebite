import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env.server";

const prismaGlobal = globalThis as unknown as {
  cinebitePrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = getServerEnv().DATABASE_URL;
  const hostname = new URL(connectionString).hostname;
  // Local PostgreSQL uses TCP; hosted Neon keeps its established serverless driver.
  // This enables real, isolated SQL tests without connecting test writes to Neon.
  const adapter = ["127.0.0.1", "localhost", "[::1]"].includes(hostname)
    ? new PrismaPg({ connectionString })
    : new PrismaNeon({ connectionString });

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
