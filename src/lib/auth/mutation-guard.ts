import { z } from "zod";

import { checkOrigin, numericId, RequestError, readBody, requestFailure, resourceId } from "./request-security";

const optionalText = z.string().max(20000).optional();
const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
const image = z
  .string()
  .max(2 * 1024 * 1024)
  .refine((value) => !value || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))
  .nullable()
  .optional();
export const projectInput = z
  .object({ id: resourceId.optional(), name: z.string().trim().min(1).max(120), url: safeUrl.optional(), logo: image })
  .strict();
export const tableInput = z
  .object({
    id: resourceId.optional(),
    projectId: resourceId.optional(),
    name: z.string().trim().min(1).max(120),
    tableType: z.enum(["TEST_CASES", "ISSUE_LOGS"]),
  })
  .strict();
export const entryInput = z
  .object({
    id: numericId.optional(),
    tableId: resourceId.optional(),
    title: z.string().trim().min(1).max(300),
    username: z.string().max(120),
    description: optionalText,
    stepsToReproduce: optionalText,
    result: optionalText,
    expectedResult: optionalText,
    assignedTo: z.string().max(254).optional(),
    status: z.enum(["SUCCESS", "FAIL"]).optional(),
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
    fixStatus: z.enum(["NEEDS_FIX", "NEEDS_RETEST", "FIXED", ""]).optional(),
    screenshotClipName: z.string().max(255).optional(),
    screenshotClipUrl: z
      .string()
      .max(12 * 1024 * 1024)
      .refine(
        (value) =>
          !value ||
          /^https?:\/\//i.test(value) ||
          /^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm));base64,[A-Za-z0-9+/=]+$/.test(value),
      )
      .optional(),
  })
  .strict();

export function secureMutation(
  handler: (req: Request) => Promise<Response>,
  schema?: z.ZodTypeAny,
  numericDelete = false,
) {
  return async (req: Request) => {
    try {
      checkOrigin(req);
      if (req.method === "DELETE") {
        const id = new URL(req.url).searchParams.get("id");
        if (!(numericDelete ? numericId : resourceId).safeParse(id).success)
          throw new RequestError(400, "Invalid resource identifier.");
      }
      let validatedRequest = req;
      if (schema) {
        const data = await readBody(req, schema, schema === entryInput ? 16 * 1024 * 1024 : 3 * 1024 * 1024);
        const headers = new Headers(req.headers);
        headers.delete("content-length");
        validatedRequest = new Request(req.url, { method: req.method, headers, body: JSON.stringify(data) });
      }
      return await handler(validatedRequest);
    } catch (error) {
      return requestFailure(error);
    }
  };
}
