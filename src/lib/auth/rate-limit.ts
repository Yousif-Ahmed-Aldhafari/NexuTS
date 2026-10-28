import { prisma } from "../prisma";
import { RequestError } from "./request-security";
import { createHash } from "node:crypto";

// Atomic SQLite upsert: shared by all workers that use the same physical database.
// Not a global distributed limiter across independent replicas/databases.
export async function enforceRateLimit(scope: string, identity: string, limit: number, windowSeconds = 900) {
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = createHash("sha256").update(`${scope}:${identity}:${window}`).digest("hex");
  const row = await prisma.authRateLimit.upsert({
    where: { key },
    create: { key, count: 1, expiresAt: new Date((window + 1) * windowSeconds * 1000) },
    update: { count: { increment: 1 } },
    select: { count: true, expiresAt: true },
  });
  if (Math.random() < 0.01) await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (row.count > limit)
    throw new RequestError(
      429,
      "Too many attempts. Try again later.",
      Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)),
    );
}
