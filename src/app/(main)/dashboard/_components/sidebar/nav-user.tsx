"use client";

import { useState } from "react";

import { LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";

import { logOut } from "@/actions/auth";
import { SystemSettingsContent } from "@/app/(main)/dashboard/settings/_components/system-settings-content";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n/use-i18n";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import type { ThemeMode } from "@/lib/preferences/theme";
import { cn, getInitials } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

export function NavUser({
  user,
}: {
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
  };
}) {
  const { t } = useI18n();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const onThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    void persistPreference("theme_mode", mode);
  };

  const themeOptions: ReadonlyArray<{
    label: string;
    mode: ThemeMode;
    Icon: typeof Sun;
  }> = [
    { label: t("theme.light"), mode: "light", Icon: Sun },
    { label: t("theme.dark"), mode: "dark", Icon: Moon },
    { label: t("theme.system"), mode: "system", Icon: Monitor },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Avatar className="h-9 w-9 cursor-pointer rounded-full border border-border">
            <AvatarImage src={user.avatar || undefined} alt={user.name} />
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" sideOffset={4}>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-full">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">{user.email}</span>
              </div>
            </div>
            <div className="px-2 pb-2">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                {themeOptions.map(({ label, mode, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onThemeChange(mode)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 transition-colors",
                      themeMode === mode
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-background hover:text-foreground",
                    )}
                    aria-label={label}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] leading-none">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setIsSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              {t("nav.settings")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await logOut();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("nav.logOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent
          className="flex h-[90dvh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-5xl"
          overlayClassName="bg-black/50 backdrop-blur-[2px]"
        >
          <DialogTitle className="sr-only">{t("common.systemSettings")}</DialogTitle>
          <SystemSettingsContent mode="modal" tabQuery="general" />
        </DialogContent>
      </Dialog>
    </>
  );
}
