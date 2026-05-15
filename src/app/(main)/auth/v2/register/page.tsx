"use client";

import Link from "next/link";

import { CircleCheckBig } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";
import { useI18n } from "@/lib/i18n/use-i18n";

import { RegisterForm } from "../../_components/register-form";

export default function RegisterV2() {
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
          <h1 className="font-medium text-3xl">{t("auth.register.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("auth.register.subtitle")}</p>
        </div>
      </div>
      <div className="space-y-4">
        <RegisterForm />
        <p className="text-center text-muted-foreground text-sm">
          {t("auth.register.hasAccount")}{" "}
          <Link prefetch={false} className="font-medium text-foreground hover:underline" href="login">
            {t("auth.login.button")}
          </Link>
        </p>
      </div>
    </div>
  );
}
