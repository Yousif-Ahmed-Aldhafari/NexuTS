import { NextResponse } from "next/server";

import { prisma } from "../prisma";
import { isAdminRole, normalizeRole, type UserRole } from "./roles";

export type AuthenticatedUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: UserRole;
  isAdmin: boolean;
};

export type AuthCheckResult =
  | {
      authenticated: false;
      user: null;
      response: NextResponse;
    }
  | {
      authenticated: true;
      user: AuthenticatedUser;
      response: null;
    };

let testAuthUser: AuthenticatedUser | null = null;

/**
 * Test fixture helper enabling direct in-memory invocation of route handlers
 * under synthetic test contexts without launching an external HTTP daemon.
 */
export function setTestAuthUser(user: AuthenticatedUser | null) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test authentication is disabled outside test mode.");
  testAuthUser = user;
}

/**
 * Validates that an active, authenticated session exists.
 * Returns HTTP 401 Unauthorized if unauthenticated.
 */
export async function requireAuth(): Promise<AuthCheckResult> {
  if (testAuthUser !== null) {
    return {
      authenticated: true,
      user: testAuthUser,
      response: null,
    };
  }

  let dbUser: {
    id: number;
    name: string | null;
    email: string | null;
    role: string;
  } | null = null;

  try {
    const { getCurrentUser } = await import("./current-user");
    dbUser = await getCurrentUser();
  } catch {
    dbUser = null;
  }

  if (!dbUser) {
    return {
      authenticated: false,
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const role = normalizeRole(dbUser.role);
  return {
    authenticated: true,
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role,
      isAdmin: isAdminRole(role),
    },
    response: null,
  };
}

/**
 * Checks if the user is authorized to view a project (read tables, view entries).
 * Admins can access all projects; regular users can only access projects they own.
 */
export function canAccessProject(
  user: { id: number; role: UserRole; isAdmin?: boolean },
  project: { userId: number | null },
): boolean {
  if (user.isAdmin || isAdminRole(user.role)) {
    return true;
  }
  return project.userId !== null && project.userId === user.id;
}

/**
 * Checks if the user is authorized to manage a project (update, delete).
 * Admins and project owners are permitted to manage the project.
 */
export function canManageProject(
  user: { id: number; role: UserRole; isAdmin?: boolean },
  project: { userId: number | null },
): boolean {
  if (user.isAdmin || isAdminRole(user.role)) {
    return true;
  }
  return project.userId !== null && project.userId === user.id;
}

/**
 * Resolves a Project by ID and verifies the authenticated user has access.
 * Returns the project if authorized, or null if not found or unauthorized.
 */
export async function resolveProjectAccess(projectId: string, user: AuthenticatedUser) {
  if (!projectId || typeof projectId !== "string") {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });

  if (!project || !canAccessProject(user, project)) {
    return null;
  }

  return project;
}

/**
 * Resolves a Table by ID, including its parent Project, and verifies the user has access.
 * Returns the table if authorized, or null if not found or unauthorized.
 */
export async function resolveTableAccess(tableId: string, user: AuthenticatedUser) {
  if (!tableId || typeof tableId !== "string") {
    return null;
  }

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      name: true,
      projectId: true,
      tableType: true,
      project: {
        select: {
          id: true,
          name: true,
          userId: true,
        },
      },
    },
  });

  if (!table || !canAccessProject(user, table.project)) {
    return null;
  }

  return table;
}

/**
 * Resolves an Entry by numeric ID, including its parent Table and Project, and verifies access.
 * Returns the entry if authorized, or null if not found or unauthorized.
 */
export async function resolveEntryAccess(entryId: number, user: AuthenticatedUser) {
  if (!Number.isSafeInteger(entryId) || entryId <= 0) {
    return null;
  }

  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      tableId: true,
      isDeleted: true,
      table: {
        select: {
          id: true,
          projectId: true,
          tableType: true,
          project: {
            select: {
              id: true,
              name: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!entry || !canAccessProject(user, entry.table.project)) {
    return null;
  }

  return entry;
}
