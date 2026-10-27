"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { normalizeEmail } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const LANGUAGE_COOKIE_NAME = "language";
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

function isSessionCookie(name: string) {
  return SESSION_COOKIE_NAMES.some((cookieName) => name === cookieName || name.startsWith(`${cookieName}.`));
}

async function updateSessionCookiePersistence(rememberMe: boolean) {
  const cookieStore = await cookies();
  const sessionCookies = cookieStore.getAll().filter((cookie) => isSessionCookie(cookie.name));

  if (sessionCookies.length === 0) {
    return;
  }

  const baseOptions = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };

  for (const sessionCookie of sessionCookies) {
    if (rememberMe) {
      cookieStore.set(sessionCookie.name, sessionCookie.value, {
        ...baseOptions,
        maxAge: THIRTY_DAYS_IN_SECONDS,
      });
      continue;
    }

    // No maxAge / expires => browser session cookie.
    cookieStore.set(sessionCookie.name, sessionCookie.value, baseOptions);
  }
}

export async function authenticate(_prevState: string | undefined, formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const rememberValue = formData.get("remember");
  const rememberMe = rememberValue === "true" || rememberValue === "on" || rememberValue === "1";
  const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";

  if (!normalizedEmail || typeof password !== "string" || password.length === 0) {
    return "Invalid credentials.";
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, language: true },
  });

  if (!user) {
    return "Invalid credentials.";
  }

  try {
    const redirectUrl = await signIn("credentials", {
      email: normalizedEmail,
      password,
      remember: rememberMe ? "true" : "false",
      redirect: false,
      redirectTo: "/dashboard/home-page",
    });

    const cookieStore = await cookies();
    const language = user.language === "ar" ? "ar" : "en";
    cookieStore.set(LANGUAGE_COOKIE_NAME, language, {
      path: "/",
      maxAge: THIRTY_DAYS_IN_SECONDS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    await updateSessionCookiePersistence(rememberMe);
    redirect(typeof redirectUrl === "string" ? redirectUrl : "/dashboard/home-page");
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}

export async function logOut() {
  await signOut({ redirectTo: "/auth/v2/login" });
}
