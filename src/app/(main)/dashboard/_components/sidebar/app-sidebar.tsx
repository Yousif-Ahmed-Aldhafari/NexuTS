"use client";

import Link from "next/link";

import { CircleCheckBig } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";

type SidebarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user?: SidebarUser;
};

export function AppSidebar({ ...props }: AppSidebarProps) {
  const { sidebarVariant, sidebarCollapsible, language, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      language: s.language,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;
  const side = isSynced ? (language === "ar" ? "right" : "left") : props.side;

  return (
    <Sidebar {...props} side={side} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="transition-all duration-300" asChild>
              <Link prefetch={false} href="/dashboard/home-page" className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black dark:text-white">
                  <CircleCheckBig className="h-6 w-6 stroke-[2.5]" />
                </div>
                <div className="flex flex-col gap-0.5 truncate leading-none">
                  <span className="truncate font-bold text-lg text-slate-900 dark:text-slate-100">
                    {APP_CONFIG.name}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
    </Sidebar>
  );
}
