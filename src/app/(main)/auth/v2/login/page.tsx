"use client";

import Link from "next/link";

import { CircleCheckBig } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";
import { useI18n } from "@/lib/i18n/use-i18n";

import { LoginForm } from "../../_components/login-form";

export default function LoginV2() {
  const { t } = useI18n();

  return (
    <div className="w-full space-y-8">
      <div className="space-y-4 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CircleCheckBig className="size-7" />
          </div>
          <p className="font-semibold text-2xl tracking-tight">{APP_CONFIG.name}</p>
        </div>
        <div className="space-y-2">
          <h1 className="font-medium text-3xl">{t("auth.login.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("auth.login.subtitle")}</p>
        </div>
      </div>
      <div className="space-y-4">
        <LoginForm />
        <p className="text-center text-muted-foreground text-sm">
          {t("auth.login.noAccount")}{" "}
          <Link prefetch={false} className="font-medium text-foreground hover:underline" href="register">
            {t("auth.register.button")}
          </Link>
        </p>
      </div>
    </div>
  );
}
