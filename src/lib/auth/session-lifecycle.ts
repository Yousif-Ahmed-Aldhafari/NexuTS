import type { JWT } from "next-auth/jwt";

import { prisma } from "../prisma";
import { RequestError } from "./request-security";

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
export const NORMAL_SESSION_AGE = 8 * 60 * 60;
export const REAUTH_MAX_AGE = 10 * 60;

export async function validateSessionToken(token: JWT): Promise<JWT | null> {
  if (
    !token.sub ||
    !/^[1-9]\d*$/.test(token.sub) ||
    typeof token.sessionVersion !== "number" ||
    typeof token.authenticatedAt !== "number" ||
    typeof token.absoluteExpiresAt !== "number" ||
    Date.now() / 1000 >= token.absoluteExpiresAt
  )
    return null;
  const user = await prisma.user.findUnique({ where: { id: Number(token.sub) } });
  if (!user || user.disabled || user.sessionVersion !== token.sessionVersion) return null;
  return {
    ...token,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    name: user.name,
    email: user.email,
    picture: user.image,
    language: user.language === "ar" ? "ar" : "en",
  };
}

export function requireRecentAuthentication(authenticatedAt: number | undefined) {
  if (!authenticatedAt || Date.now() / 1000 - authenticatedAt > REAUTH_MAX_AGE) {
    throw new RequestError(403, "Please sign in again before changing account security settings.");
  }
}
