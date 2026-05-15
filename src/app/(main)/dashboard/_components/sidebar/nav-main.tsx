"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { NavGroup, NavMainItem } from "@/navigation/sidebar/sidebar-items";

interface NavMainProps {
  readonly items: readonly NavGroup[];
}

const IsComingSoon = ({ label }: { label: string }) => (
  <span className="ms-auto rounded-md bg-gray-200 px-2 py-1 text-xs dark:text-gray-800">{label}</span>
);

const NavItemExpanded = ({
  item,
  isActive,
  isSubmenuOpen,
  resolveItemTitle,
  resolveSubItemTitle,
  soonLabel,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean;
  resolveItemTitle: (entry: NavMainItem) => string;
  resolveSubItemTitle: (entry: NonNullable<NavMainItem["subItems"]>[number]) => string;
  soonLabel: string;
}) => {
  return (
    <Collapsible key={item.title} asChild defaultOpen={isSubmenuOpen(item.subItems)} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {item.subItems ? (
            <SidebarMenuButton
              size="lg"
              disabled={item.comingSoon}
              isActive={isActive(item.url, item.subItems)}
              tooltip={resolveItemTitle(item)}
              className="transition-all duration-300 hover:bg-sidebar-accent"
            >
              {item.icon && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <item.icon className="h-5 w-5" />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-0.5 truncate text-start leading-none">
                <span className="truncate font-semibold text-slate-900 text-sm dark:text-slate-100">
                  {resolveItemTitle(item)}
                </span>
              </div>
              {item.comingSoon && <IsComingSoon label={soonLabel} />}
              <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              size="lg"
              asChild
              aria-disabled={item.comingSoon}
              isActive={isActive(item.url)}
              tooltip={resolveItemTitle(item)}
              className="transition-all duration-300 hover:bg-sidebar-accent"
            >
              <Link
                prefetch={false}
                href={item.url}
                target={item.newTab ? "_blank" : undefined}
                className="flex items-center gap-3"
              >
                {item.icon && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    <item.icon className="h-5 w-5" />
                  </div>
                )}
                <div className="flex flex-col gap-0.5 truncate leading-none">
                  <span className="truncate font-semibold text-slate-900 text-sm dark:text-slate-100">
                    {resolveItemTitle(item)}
                  </span>
                </div>
                {item.comingSoon && <IsComingSoon label={soonLabel} />}
              </Link>
            </SidebarMenuButton>
          )}
        </CollapsibleTrigger>
        {item.subItems && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.subItems.map((subItem) => (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton aria-disabled={subItem.comingSoon} isActive={isActive(subItem.url)} asChild>
                    <Link prefetch={false} href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                      {subItem.icon && <subItem.icon />}
                      <span>{resolveSubItemTitle(subItem)}</span>
                      {subItem.comingSoon && <IsComingSoon label={soonLabel} />}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
};

const NavItemCollapsed = ({
  item,
  isActive,
  resolveItemTitle,
  resolveSubItemTitle,
  soonLabel,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  resolveItemTitle: (entry: NavMainItem) => string;
  resolveSubItemTitle: (entry: NonNullable<NavMainItem["subItems"]>[number]) => string;
  soonLabel: string;
}) => {
  return (
    <SidebarMenuItem key={item.title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            disabled={item.comingSoon}
            tooltip={resolveItemTitle(item)}
            isActive={isActive(item.url, item.subItems)}
            className="transition-all duration-300 hover:bg-sidebar-accent"
          >
            {item.icon && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <item.icon className="h-5 w-5" />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-0.5 truncate text-start leading-none">
              <span className="truncate font-semibold text-slate-900 text-sm dark:text-slate-100">
                {resolveItemTitle(item)}
              </span>
            </div>
            <ChevronRight className="ms-auto" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-50 space-y-1" side="right" align="start">
          {item.subItems?.map((subItem) => (
            <DropdownMenuItem key={subItem.title} asChild>
              <SidebarMenuSubButton
                key={subItem.title}
                asChild
                className="focus-visible:ring-0"
                aria-disabled={subItem.comingSoon}
                isActive={isActive(subItem.url)}
              >
                <Link prefetch={false} href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                  {subItem.icon && <subItem.icon className="[&>svg]:text-sidebar-foreground" />}
                  <span>{resolveSubItemTitle(subItem)}</span>
                  {subItem.comingSoon && <IsComingSoon label={soonLabel} />}
                </Link>
              </SidebarMenuSubButton>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

export function NavMain({ items }: NavMainProps) {
  const path = usePathname();
  const searchParams = useSearchParams();
  const { state, isMobile } = useSidebar();
  const { t } = useI18n();

  const soonLabel = t("nav.soon");
  const resolveItemTitle = (entry: NavMainItem) => (entry.titleKey ? t(entry.titleKey) : entry.title);
  const resolveSubItemTitle = (entry: NonNullable<NavMainItem["subItems"]>[number]) =>
    entry.titleKey ? t(entry.titleKey) : entry.title;

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (subItems?.length) {
      return subItems.some((sub) => path.startsWith(sub.url));
    }

    const [basePath, query] = url.split("?");

    if (query) {
      if (path !== basePath) return false;
      const targetParams = new URLSearchParams(query);

      return Array.from(targetParams.entries()).every(([key, value]) => searchParams.get(key) === value);
    }

    if (url === "/dashboard/qa-boards") {
      return path.startsWith("/dashboard/qa-boards");
    }
    return path === url;
  };

  const isSubmenuOpen = (subItems?: NavMainItem["subItems"]) => {
    return subItems?.some((sub) => path.startsWith(sub.url)) ?? false;
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              {/* <SidebarMenuButton
                size="lg"
                tooltip="Quick Test"
                className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white dark:bg-blue-600 dark:hover:bg-blue-700 transition-all duration-300"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
                  <PlusCircleIcon className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none truncate text-left">
                  <span className="font-semibold text-sm truncate">Quick Test</span>
                </div>
              </SidebarMenuButton> */}
              {/* <Button
                size="icon"
                className="h-9 w-9 shrink-0 group-data-[collapsible=icon]:opacity-0"
                variant="outline"
              >
                <Edit />
                <span className="sr-only">Inbox</span>
              </Button> */}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && <SidebarGroupLabel>{group.labelKey ? t(group.labelKey) : group.label}</SidebarGroupLabel>}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => {
                if (state === "collapsed" && !isMobile) {
                  // If no subItems, just render the button as a link
                  if (!item.subItems) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          size="lg"
                          asChild
                          aria-disabled={item.comingSoon}
                          tooltip={resolveItemTitle(item)}
                          isActive={isItemActive(item.url)}
                          className="transition-all duration-300 hover:bg-sidebar-accent"
                        >
                          <Link
                            prefetch={false}
                            href={item.url}
                            target={item.newTab ? "_blank" : undefined}
                            className="flex items-center gap-3"
                          >
                            {item.icon && (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                                <item.icon className="h-5 w-5" />
                              </div>
                            )}
                            <div className="flex flex-col gap-0.5 truncate leading-none">
                              <span className="truncate font-semibold text-slate-900 text-sm dark:text-slate-100">
                                {resolveItemTitle(item)}
                              </span>
                            </div>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  // Otherwise, render the dropdown as before
                  return (
                    <NavItemCollapsed
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      resolveItemTitle={resolveItemTitle}
                      resolveSubItemTitle={resolveSubItemTitle}
                      soonLabel={soonLabel}
                    />
                  );
                }
                // Expanded view
                return (
                  <NavItemExpanded
                    key={item.title}
                    item={item}
                    isActive={isItemActive}
                    isSubmenuOpen={isSubmenuOpen}
                    resolveItemTitle={resolveItemTitle}
                    resolveSubItemTitle={resolveSubItemTitle}
                    soonLabel={soonLabel}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
