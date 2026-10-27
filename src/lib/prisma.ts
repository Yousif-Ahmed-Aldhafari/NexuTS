import { PrismaClient } from "@prisma/client";

import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  let datasources: { db: { url: string } } | undefined;

  if (databaseUrl) {
    if (!databaseUrl.startsWith("file:")) {
      throw new Error(
        `Prisma database verification failed: expected SQLite URL starting with "file:", got "${databaseUrl}".`,
      );
    }

    const rawPath = databaseUrl.slice(5).split("?")[0];
    const resolvedPath = path.isAbsolute(rawPath)
      ? path.normalize(rawPath)
      : path.resolve(process.cwd(), "prisma", rawPath);

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      throw new Error(
        `Prisma database verification failed: target database file not found at "${resolvedPath}" (resolved from DATABASE_URL="${databaseUrl}"). Startup halted to prevent silent fallback.`,
      );
    }

    datasources = {
      db: {
        url: databaseUrl,
      },
    };
  }

  return new PrismaClient({
    datasources,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
