import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// We import bcryptjs dynamically or define our own basic comparison to avoid edge runtime issues with bcrypt.
// Note: bcryptjs works but can be tricky in Next.js edge runtime.

import { hashPassword, verifyPassword } from "./lib/auth/password";
import { isAdminEmail, isAdminRole, normalizeEmail, normalizeRole, USER_ROLES } from "./lib/auth/roles";
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
  session: { strategy: "jwt" },
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
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
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

        if (!user || !user?.password) {
          throw new Error("Invalid credentials");
        }

        const candidatePassword = String(credentials.password);
        const { valid, needsUpgrade } = await verifyPassword(candidatePassword, user.password);

        if (!valid) {
          throw new Error("Invalid credentials");
        }

        if (needsUpgrade) {
          try {
            const upgradedHash = await hashPassword(candidatePassword);
            await prisma.user.updateMany({
              where: {
                id: user.id,
                password: user.password,
              },
              data: {
                password: upgradedHash,
              },
            });
          } catch (upgradeError) {
            console.error("[auth] Failed to upgrade legacy password", upgradeError);
          }
        }

        if (isAdminEmail(user.email) && !isAdminRole(user.role)) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { role: USER_ROLES.ADMIN },
          });
        }

        return {
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
  callbacks: {
    async session({ token, session }) {
      if (token.sub && session.user) {
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

      try {
        const sessionUserId = token.sub ? Number.parseInt(token.sub, 10) : Number.NaN;
        const normalizedTokenEmail = normalizeEmail(token.email);
        const dbUser =
          Number.isSafeInteger(sessionUserId) && sessionUserId > 0
            ? await prisma.user.findUnique({
                where: { id: sessionUserId },
                select: { id: true, email: true, role: true, language: true },
              })
            : normalizedTokenEmail
              ? await prisma.user.findUnique({
                  where: { email: normalizedTokenEmail },
                  select: { id: true, email: true, role: true, language: true },
                })
              : null;

        if (dbUser) {
          let currentRole = normalizeRole(dbUser.role);
          if (isAdminEmail(dbUser.email) && !isAdminRole(dbUser.role)) {
            const updatedUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: { role: USER_ROLES.ADMIN },
              select: { role: true },
            });
            currentRole = normalizeRole(updatedUser.role);
          }

          token.role = currentRole;
          token.sub = String(dbUser.id);
          token.email = dbUser.email ?? token.email;
          token.language = isSupportedLocale(dbUser.language) ? dbUser.language : DEFAULT_LOCALE;
        }
      } catch (error) {
        console.error("[auth][jwt] Failed to hydrate role from database", error);
      }

      return token;
    },
  },
});
