import { NextResponse } from "next/server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { RequestError, readBody, requestFailure } from "@/lib/auth/request-security";
import { consumeVerification, deliverVerification, issueVerification } from "@/lib/auth/verification";

const schema = z.union([
  z.object({ action: z.literal("request") }).strict(),
  z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.email) throw new RequestError(401, "Unauthorized");
    await enforceRateLimit("verify-attempt", String(user.id), 10);
    const body = await readBody(req, schema, 4096);
    if ("action" in body) {
      await enforceRateLimit("verify-send", String(user.id), 3, 3600);
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
        throw new RequestError(503, "Email delivery is not configured. Contact your administrator.");
      const token = await issueVerification(user.id, user.email);
      await deliverVerification(user.email, token);
      return NextResponse.json({ success: true });
    }
    const verifiedUser = await consumeVerification(user.id, user.email, body.code);
    return NextResponse.json({ success: true, user: verifiedUser });
  } catch (error) {
    return requestFailure(error);
  }
}
