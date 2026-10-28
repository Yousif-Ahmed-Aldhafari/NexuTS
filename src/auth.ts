import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { hashPassword, verifyPassword } from "./lib/auth/password";
import { enforceRateLimit } from "./lib/auth/rate-limit";
import { emailField } from "./lib/auth/request-security";
import { normalizeEmail, normalizeRole } from "./lib/auth/roles";
import { NORMAL_SESSION_AGE, SESSION_MAX_AGE, validateSessionToken } from "./lib/auth/session-lifecycle";
import { type AppLocale, DEFAULT_LOCALE, LOCALE_VALUES } from "./lib/i18n";
import { prisma } from "./lib/prisma";

const isSupportedLocale = (value: unknown): value is AppLocale =>
  typeof value === "string" && LOCALE_VALUES.includes(value as AppLocale);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  jwt: { maxAge: SESSION_MAX_AGE },
  logger: {
    error() {
      console.error("[auth] Authentication operation failed.");
    },
  },
  pages: {
    signIn: "/auth/v2/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember Me", type: "text" },
      },
      async authorize(credentials) {
        const parsedEmail = emailField.safeParse(credentials?.email);
        if (
          !parsedEmail.success ||
          typeof credentials?.password !== "string" ||
          !credentials.password ||
          credentials.password.length > 1024
        )
          return null;
        try {
          await enforceRateLimit("login-account", parsedEmail.data, 8);
          await enforceRateLimit("login-global", "all", 3000);
        } catch {
          return null;
        }
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const submittedEmail = String(credentials.email).trim();
        const normalizedSubmittedEmail = normalizeEmail(submittedEmail);

        let user = await prisma.user.findUnique({
          where: {
            email: submittedEmail,
          },
        });

        if (!user && normalizedSubmittedEmail && normalizedSubmittedEmail !== submittedEmail) {
          user = await prisma.user.findUnique({
            where: {
              email: normalizedSubmittedEmail,
            },
          });
        }

        if (!user || !user.password || user.disabled) {
          await verifyPassword(
            String(credentials.password),
            "$2b$12$5KqID.TUwUmS8BkawYPxVuI9gfo1jJr0J1E3HwFh7xvJXch8RDc0K",
          );
          return null;
        }

        const candidatePassword = String(credentials.password);
        const { valid, needsUpgrade } = await verifyPassword(candidatePassword, user.password);

        if (!valid) {
          return null;
        }

        let authenticatedVersion = user.sessionVersion;
        let authenticatedPassword = user.password;
        if (needsUpgrade) {
          try {
            const upgradedHash = await hashPassword(candidatePassword);
            const upgraded = await prisma.user.updateMany({
              where: {
                id: user.id,
                password: user.password,
                sessionVersion: user.sessionVersion,
              },
              data: {
                password: upgradedHash,
              },
            });
            if (upgraded.count !== 1) return null;
            authenticatedPassword = upgradedHash;
            authenticatedVersion += 1;
          } catch (_upgradeError) {
            console.error("[auth] Legacy credential upgrade failed.");
            return null;
          }
        }

        const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (
          !freshUser ||
          freshUser.disabled ||
          freshUser.sessionVersion !== authenticatedVersion ||
          freshUser.password !== authenticatedPassword
        )
          return null;
        return {
          sessionVersion: freshUser.sessionVersion,
          authenticatedAt: Math.floor(Date.now() / 1000),
          absoluteExpiresAt:
            Math.floor(Date.now() / 1000) + (credentials.remember === "true" ? SESSION_MAX_AGE : NORMAL_SESSION_AGE),
          id: String(user.id),
          email: user.email,
          name: user.name,
          image: user.image,
          role: normalizeRole(user.role),
          language: isSupportedLocale(user.language) ? user.language : DEFAULT_LOCALE,
        };
      },
    }),
  ],
  events: {
    async signOut(message) {
      if (
        "token" in message &&
        message.token?.sub &&
        /^[1-9]\d*$/.test(message.token.sub) &&
        typeof message.token.sessionVersion === "number"
      ) {
        await prisma.user.updateMany({
          where: { id: Number(message.token.sub), sessionVersion: message.token.sessionVersion },
          data: { sessionVersion: { increment: 1 } },
        });
      }
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl);
        return target.origin === new URL(baseUrl).origin ? target.href : baseUrl;
      } catch {
        return baseUrl;
      }
    },
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.authenticatedAt = token.authenticatedAt as number;
        session.user.id = token.sub;
        session.user.role = normalizeRole(typeof token.role === "string" ? token.role : undefined);
        session.user.language = isSupportedLocale(token.language) ? token.language : DEFAULT_LOCALE;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = String(user.id);
        token.role = normalizeRole(typeof user.role === "string" ? user.role : undefined);
        token.email = user.email ?? token.email;
        token.language = isSupportedLocale(user.language) ? user.language : DEFAULT_LOCALE;
      }

      if (user) {
        token.sessionVersion = user.sessionVersion;
        token.authenticatedAt = user.authenticatedAt;
        token.absoluteExpiresAt = user.absoluteExpiresAt;
      }
      try {
        return await validateSessionToken(token);
      } catch {
        return null;
      }
    },
  },
});
