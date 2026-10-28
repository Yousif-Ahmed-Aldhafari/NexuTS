import { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { checkOrigin, readLimitedText, requestFailure } from "@/lib/auth/request-security";

export const GET = handlers.GET;
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    if (Number(req.headers.get("content-length")) > 8192) return new Response(null, { status: 413 });
    await enforceRateLimit("auth-http", "all", 100, 900);
    const text = await readLimitedText(req, 8192);
    // Auth.js retains its own CSRF checks; never skip or replace them here.
    if (new URL(req.url).pathname.endsWith("/callback/credentials")) {
      const email = new URLSearchParams(text).get("email")?.trim().toLowerCase() || "unknown";
      await enforceRateLimit("auth-http-account", email.slice(0, 254), 8);
    }
    const headers = new Headers(req.headers);
    headers.delete("content-length");
    return handlers.POST(new NextRequest(req.url, { method: "POST", headers, body: text }));
  } catch (error) {
    return requestFailure(error);
  }
}
