import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/auth/roles";
import type { AppLocale } from "@/lib/i18n";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      language: AppLocale;
    };
  }

  interface User {
    role?: UserRole;
    language?: AppLocale;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    language?: AppLocale;
  }
}
