import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/auth/roles";
import type { AppLocale } from "@/lib/i18n";

declare module "next-auth" {
  interface Session {
    authenticatedAt?: number;
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      language: AppLocale;
    };
  }

  interface User {
    sessionVersion?: number;
    authenticatedAt?: number;
    absoluteExpiresAt?: number;
    role?: UserRole;
    language?: AppLocale;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionVersion?: number;
    authenticatedAt?: number;
    absoluteExpiresAt?: number;
    role?: UserRole;
    language?: AppLocale;
  }
}
