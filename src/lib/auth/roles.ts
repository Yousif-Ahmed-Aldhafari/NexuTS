export const USER_ROLES = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const VALID_ROLES: readonly UserRole[] = [USER_ROLES.ADMIN, USER_ROLES.USER];

export function normalizeEmail(email: string | null | undefined): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Validates that an unknown value strictly matches one of the defined system roles.
 */
export function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && (VALID_ROLES as readonly string[]).includes(role);
}

/**
 * Normalizes an unknown or null role value to a valid UserRole.
 * Defaults to USER if not strictly ADMIN.
 */
export function normalizeRole(role: string | null | undefined): UserRole {
  return role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.USER;
}

/**
 * Checks if a normalized role represents an administrator.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === USER_ROLES.ADMIN;
}
