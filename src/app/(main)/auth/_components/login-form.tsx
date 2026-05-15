"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/use-i18n";
import { showErrorMessage, showSuccessMessage } from "@/lib/notifications";

type LoginFormValues = {
  email: string;
  password: string;
  remember?: boolean;
};

type RedirectError = {
  digest: string;
};

const isNextRedirectError = (error: unknown): error is RedirectError => {
  if (error === null || typeof error !== "object" || !("digest" in error)) {
    return false;
  }

  const { digest } = error as { digest?: unknown };
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
};

export function LoginForm() {
  const { t } = useI18n();
  const getLoginErrorMessage = (message: string) => {
    if (message === "Invalid credentials." || message === "Incorrect password") {
      return t("auth.login.invalidCredentials");
    }
    if (message === "This User Does not exits!") {
      return t("auth.login.userNotFound");
    }
    if (message === "Something went wrong.") {
      return t("auth.login.unexpected");
    }
    return t("auth.login.unexpected");
  };

  const formSchema = React.useMemo(
    () =>
      z.object({
        email: z.string().email({ message: t("auth.validation.emailInvalid") }),
        password: z.string().min(6, { message: t("auth.validation.passwordMin6") }),
        remember: z.boolean().optional(),
      }),
    [t],
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  const [isPending, startTransition] = React.useTransition();
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);

  const onSubmit = (data: LoginFormValues) => {
    startTransition(async () => {
      try {
        const { authenticate } = await import("@/actions/auth");
        const formData = new FormData();
        formData.append("email", data.email);
        formData.append("password", data.password);
        formData.append("remember", data.remember ? "true" : "false");
        formData.append("redirectTo", "/dashboard/home-page");

        const result = await authenticate(undefined, formData);

        if (result) {
          setIsRedirecting(false);
          showErrorMessage(getLoginErrorMessage(result));
        } else {
          setIsRedirecting(true);
          showSuccessMessage(t("auth.login.redirecting"));
        }
      } catch (error) {
        if (isNextRedirectError(error)) {
          setIsRedirecting(true);
          showSuccessMessage(t("auth.login.redirecting"));
          throw error;
        }
        setIsRedirecting(false);
        showErrorMessage(t("auth.login.unexpected"));
      }
    });
  };

  return (
    <Form {...form}>
      <form
        method="POST"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.field.email")}</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.placeholder.email")}
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.field.password")}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    id="password"
                    type={isPasswordVisible ? "text" : "password"}
                    placeholder={t("auth.placeholder.password")}
                    autoComplete="current-password"
                    className="pe-10"
                    {...field}
                  />
                  <button
                    type="button"
                    className="-translate-y-1/2 absolute end-3 top-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    aria-label={isPasswordVisible ? t("auth.password.hide") : t("auth.password.show")}
                    aria-pressed={isPasswordVisible}
                    onClick={() => setIsPasswordVisible((value) => !value)}
                  >
                    {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="remember"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center">
              <FormControl>
                <Checkbox
                  id="login-remember"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="size-4"
                />
              </FormControl>
              <FormLabel htmlFor="login-remember" className="ms-1 font-medium text-muted-foreground text-sm">
                {t("auth.field.remember")}
              </FormLabel>
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isPending || isRedirecting}>
          {isPending || isRedirecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="sr-only">{t("auth.login.srLogging")}</span>
            </>
          ) : (
            t("auth.login.button")
          )}
        </Button>
      </form>
    </Form>
  );
}
