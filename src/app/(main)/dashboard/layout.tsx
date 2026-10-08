import type { ReactNode } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Bell } from "lucide-react";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getLocaleDirection, LOCALE_VALUES, translate } from "@/lib/i18n";
import { SIDEBAR_COLLAPSIBLE_VALUES, SIDEBAR_VARIANT_VALUES } from "@/lib/preferences/layout";
import { cn } from "@/lib/utils";
import { getPreference } from "@/server/server-actions";

import { NavUser } from "./_components/sidebar/nav-user";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  let session = null;

  try {
    session = await auth();
  } catch (error) {
    console.error("[dashboard/layout] Failed to read auth session", error);
    redirect("/auth/v2/login");
  }

  if (!session?.user) {
    redirect("/auth/v2/login");
  }

  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [language, variant, collapsible] = await Promise.all([
    getPreference("language", LOCALE_VALUES, "en"),
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
    getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
  ]);

  const notificationsLabel = translate(language, "nav.notifications");
  const fallbackUserName = translate(language, "common.user");
  const sidebarSide = getLocaleDirection(language) === "rtl" ? "right" : "left";

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-dvh min-h-0 overflow-hidden">
      <AppSidebar side={sidebarSide} variant={variant} collapsible={collapsible} user={session?.user} />
      <SidebarInset
        className={cn(
          "min-h-0 w-full min-w-0 max-w-full overflow-hidden",
          "[html[data-content-layout=centered]_&]:mx-auto! [html[data-content-layout=centered]_&]:max-w-screen-2xl!",
          // Keep inset spacing balanced per active sidebar side.
          "max-[113rem]:peer-data-[variant=inset]:peer-data-[side=left]:mr-2! min-[101rem]:peer-data-[variant=inset]:peer-data-[side=left]:peer-data-[state=collapsed]:mr-auto!",
          "max-[113rem]:peer-data-[variant=inset]:peer-data-[side=right]:ml-2! min-[101rem]:peer-data-[variant=inset]:peer-data-[side=right]:peer-data-[state=collapsed]:ml-auto!",
        )}
      >
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            // Handle sticky navbar style with conditional classes so blur, background, z-index, and rounded corners remain consistent across all SidebarVariant layouts.
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex w-full min-w-0 max-w-full items-center justify-between overflow-x-hidden px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ms-1" />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="icon" className="cursor-pointer rounded-full">
                <Bell className="size-5" />
                <span className="sr-only">{notificationsLabel}</span>
              </Button>
              {session?.user ? (
                <NavUser
                  user={{
                    name: session.user.name || fallbackUserName,
                    email: session.user.email || "",
                    avatar: session.user.image || "",
                  }}
                />
              ) : null}
            </div>
          </div>
        </header>
        <div className="dashboard-content min-h-0 w-full min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
