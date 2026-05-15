export const USER_ROLES = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

const ADMIN_EMAILS = new Set(["yousif.aldhafari@gmail.com"]);

export function normalizeEmail(email: string | null | undefined) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isAdminEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && ADMIN_EMAILS.has(normalized);
}

export function resolveRoleFromEmail(email: string | null | undefined): UserRole {
  return isAdminEmail(email) ? USER_ROLES.ADMIN : USER_ROLES.USER;
}

export function normalizeRole(role: string | null | undefined): UserRole {
  return role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.USER;
}

export function isAdminRole(role: string | null | undefined) {
  return normalizeRole(role) === USER_ROLES.ADMIN;
}
