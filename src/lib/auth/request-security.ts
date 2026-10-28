import { NextResponse } from "next/server";

import { z } from "zod";

export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter = 900,
  ) {
    super(message);
  }
}

export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (process.env.NODE_ENV === "production") {
    if (!process.env.AUTH_URL) throw new RequestError(503, "Canonical application origin is not configured.");
    const canonical = new URL(process.env.AUTH_URL);
    if (canonical.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(canonical.hostname)) {
      throw new RequestError(503, "HTTPS application origin is required.");
    }
  }
  const expected = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : new URL(req.url).origin;
  if (
    req.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== expected) ||
    (!origin && process.env.NODE_ENV === "production")
  ) {
    throw new RequestError(403, "Invalid request origin.");
  }
}

export async function readBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  maxBytes = 1024 * 1024,
): Promise<z.infer<T>> {
  checkOrigin(req);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestError(415, "JSON content type required.");
  }
  const text = await readLimitedText(req, maxBytes);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RequestError(400, "Invalid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new RequestError(400, "Invalid request fields.");
  return parsed.data;
}

export function requestFailure(error: unknown) {
  if (error instanceof RequestError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: error.status === 429 ? { "Retry-After": String(error.retryAfter) } : undefined },
    );
  // Never serialize Prisma errors (may contain submitted credentials or stored fields).
  return NextResponse.json({ error: "Request could not be completed." }, { status: 500 });
}

export const numericId = z
  .union([
    z.number().int().positive().max(2147483647),
    z
      .string()
      .regex(/^[1-9]\d{0,9}$/)
      .transform(Number),
  ])
  .refine((n) => n <= 2147483647);
export const resourceId = z.string().cuid();
export const nameField = z.string().trim().min(1).max(120);
export const emailField = z.string().trim().toLowerCase().email().max(254);

export async function readLimitedText(req: Request, maxBytes: number) {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new RequestError(413, "Request too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError(400, "Invalid request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestError(413, "Request too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
