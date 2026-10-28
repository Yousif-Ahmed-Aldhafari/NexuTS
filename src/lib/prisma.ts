import { PrismaClient } from "@prisma/client";

import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  let datasources: { db: { url: string } } | undefined;

  if (!databaseUrl) throw new Error("DATABASE_URL is required; refusing implicit database fallback.");

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

    const physicalPath = fs.realpathSync(resolvedPath);
    const protectedPath = path.resolve(process.cwd(), "prisma/dev.db");
    if (fs.existsSync(protectedPath)) {
      const target = fs.statSync(physicalPath);
      const protectedFile = fs.statSync(protectedPath);
      if (target.dev === protectedFile.dev && target.ino === protectedFile.ino) {
        throw new Error("The protected original database cannot be used by this security branch.");
      }
    }
    if (
      process.env.NODE_ENV !== "production" &&
      physicalPath !== fs.realpathSync(path.resolve(process.cwd(), "prisma/dev-isolated.db"))
    ) {
      throw new Error("Development and test database must be prisma/dev-isolated.db.");
    }

    datasources = {
      db: {
        url: databaseUrl,
      },
    };
  }

  return new PrismaClient({
    datasources,
    log: [],
  });
}

export const prisma = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
