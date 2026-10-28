import { NextResponse } from "next/server";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMetadata;
}

export type ParsePaginationResult = { ok: true; params: PaginationParams } | { ok: false; error: string };

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function parsePaginationParams(
  searchParams: URLSearchParams,
  options: PaginationOptions = {},
): ParsePaginationResult {
  const defaultLimit = options.defaultLimit ?? DEFAULT_PAGE_SIZE;
  const maxLimit = options.maxLimit ?? MAX_PAGE_SIZE;

  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");

  let page = 1;
  let limit = defaultLimit;

  if (rawPage !== null && rawPage !== "") {
    const parsedPage = Number(rawPage);
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1) {
      return {
        ok: false,
        error: "Invalid 'page' parameter: must be a positive integer.",
      };
    }
    page = parsedPage;
  }

  if (rawLimit !== null && rawLimit !== "") {
    const parsedLimit = Number(rawLimit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > maxLimit) {
      return {
        ok: false,
        error: `Invalid 'limit' parameter: must be an integer between 1 and ${maxLimit}.`,
      };
    }
    limit = parsedLimit;
  }

  const skip = (page - 1) * limit;
  const take = limit;

  return {
    ok: true,
    params: {
      page,
      limit,
      skip,
      take,
    },
  };
}

export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  params: { page: number; limit: number },
  format?: string | null,
): NextResponse {
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit);
  const hasMore = params.page < totalPages;

  const headers = new Headers({
    "X-Total-Count": String(total),
    "X-Page": String(params.page),
    "X-Limit": String(params.limit),
    "X-Total-Pages": String(totalPages),
  });

  if (format === "array") {
    return NextResponse.json(items, { headers });
  }

  const payload: PaginatedResult<T> = {
    items,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasMore,
    },
  };

  return NextResponse.json(payload, { headers });
}
