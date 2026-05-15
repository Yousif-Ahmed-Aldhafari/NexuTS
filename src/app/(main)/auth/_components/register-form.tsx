"use client";

import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/use-i18n";
import { showErrorMessage, showSuccessMessage } from "@/lib/notifications";

type RegisterFormValues = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export function RegisterForm() {
  const { t } = useI18n();
  const mapRegisterError = React.useCallback(
    (message: unknown) => {
      if (typeof message !== "string") return t("auth.register.failed");
      if (message === "Username, email and password are required") return t("auth.register.requiredFields");
      if (message === "User already exists") return t("auth.register.userExists");
      return t("auth.register.failed");
    },
    [t],
  );

  const formSchema = React.useMemo(
    () =>
      z
        .object({
          username: z.string().min(2, { message: t("auth.validation.usernameMin2") }),
          email: z.string().email({ message: t("auth.validation.emailInvalid") }),
          password: z.string().min(6, { message: t("auth.validation.passwordMin6") }),
          confirmPassword: z.string().min(6, { message: t("auth.validation.confirmPasswordMin6") }),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t("auth.validation.passwordsMatch"),
          path: ["confirmPassword"],
        }),
    [t],
  );

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const [isPending, startTransition] = React.useTransition();
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = React.useState(false);

  const onSubmit = async (data: RegisterFormValues) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: data.username, email: data.email, password: data.password }),
        });

        const json = await response.json();

        if (!response.ok) {
          setIsRedirecting(false);
          showErrorMessage(mapRegisterError(json.error));
          return;
        }

        setIsRedirecting(true);
        showSuccessMessage(t("auth.register.success"));
        window.location.href = "/auth/v2/login";
      } catch (_error) {
        setIsRedirecting(false);
        showErrorMessage(t("auth.register.unexpected"));
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
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.field.username")}</FormLabel>
              <FormControl>
                <Input id="username" placeholder={t("auth.placeholder.username")} autoComplete="username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
                    autoComplete="new-password"
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
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.field.confirmPassword")}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={isConfirmPasswordVisible ? "text" : "password"}
                    placeholder={t("auth.placeholder.password")}
                    autoComplete="new-password"
                    className="pe-10"
                    {...field}
                  />
                  <button
                    type="button"
                    className="-translate-y-1/2 absolute end-3 top-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    aria-label={isConfirmPasswordVisible ? t("auth.password.hide") : t("auth.password.show")}
                    aria-pressed={isConfirmPasswordVisible}
                    onClick={() => setIsConfirmPasswordVisible((value) => !value)}
                  >
                    {isConfirmPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isPending || isRedirecting}>
          {isPending || isRedirecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="sr-only">{t("auth.register.srRegistering")}</span>
            </>
          ) : (
            t("auth.register.button")
          )}
        </Button>
      </form>
    </Form>
  );
}
