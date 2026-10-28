import { prisma } from "../prisma";
import { RequestError } from "./request-security";
import { createHash, randomBytes } from "node:crypto";

export const VERIFICATION_TTL = 15 * 60 * 1000;
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueVerification(userId: number, email: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction(async (tx) => {
    await tx.verificationProof.deleteMany({ where: { userId, purpose: "verify-email" } });
    await tx.verificationProof.create({
      data: {
        digest: tokenDigest(token),
        userId,
        email,
        purpose: "verify-email",
        expiresAt: new Date(Date.now() + VERIFICATION_TTL),
      },
    });
  });
  return token; // Trusted delivery layer only. Never serialize to an HTTP response.
}

export async function consumeVerification(userId: number, email: string, token: string) {
  return prisma.$transaction(async (tx) => {
    // Delete and update in one transaction; updateMany rechecks account/email binding.
    const proof = await tx.verificationProof.deleteMany({
      where: {
        digest: tokenDigest(token),
        userId,
        email,
        purpose: "verify-email",
        expiresAt: { gt: new Date() },
      },
    });
    if (proof.count !== 1) throw new RequestError(400, "Invalid or expired verification token.");
    const updated = await tx.user.updateMany({
      where: { id: userId, email, disabled: false },
      data: { emailVerified: new Date() },
    });
    if (updated.count !== 1) throw new RequestError(400, "Invalid or expired verification token.");
    return tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerified: true } });
  });
}

export async function deliverVerification(email: string, token: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    throw new RequestError(503, "Email delivery is not configured. Contact your administrator.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: "NexuTS email verification",
      text: `Enter this verification token in NexuTS within 15 minutes:\n${token}\nIf you did not request this, ignore this message.`,
    }),
  });
  if (!response.ok) throw new RequestError(503, "Email delivery is unavailable. Try again later.");
}
