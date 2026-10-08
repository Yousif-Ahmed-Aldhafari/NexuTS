"use client";

import { LayoutGrid, List } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

export type LayoutSwitcherValue = "grid" | "table";

export type LayoutSwitcherProps = {
  value: LayoutSwitcherValue;
  onChange: (value: LayoutSwitcherValue) => void;
  ariaLabel?: string;
  className?: string;
  withTooltips?: boolean;
};

const layoutToggleGroupClassName =
  "inline-flex items-center rounded-container border border-border bg-white p-1 shadow-sm dark:bg-slate-900";
const layoutToggleItemBaseClassName = "h-9 w-9 rounded-lg border border-transparent p-0 shadow-none transition-all";

type LayoutSwitcherItemProps = {
  currentValue: LayoutSwitcherValue;
  value: LayoutSwitcherValue;
  label: string;
  withTooltip: boolean;
  children: React.ReactNode;
};

function LayoutSwitcherItem({ currentValue, value, label, withTooltip, children }: LayoutSwitcherItemProps) {
  const item = (
    <ToggleGroupItem
      value={value}
      aria-label={label}
      className={cn(
        layoutToggleItemBaseClassName,
        currentValue === value
          ? "!bg-slate-200 !text-black dark:!bg-slate-700 dark:!text-white shadow-sm ring-1 ring-slate-300 dark:ring-slate-600"
          : "!bg-transparent !text-slate-600 hover:!bg-slate-100 dark:!text-slate-400 dark:hover:!bg-slate-800",
      )}
    >
      {children}
    </ToggleGroupItem>
  );

  if (!withTooltip) {
    return item;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function LayoutSwitcher({ value, onChange, ariaLabel, className, withTooltips = true }: LayoutSwitcherProps) {
  const { t } = useI18n();
  const resolvedAriaLabel = ariaLabel ?? t("layout.switch");
  const gridLabel = t("layout.gridView");
  const tableLabel = t("layout.tableView");

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (!nextValue) return;
        onChange(nextValue as LayoutSwitcherValue);
      }}
      aria-label={resolvedAriaLabel}
      className={cn(layoutToggleGroupClassName, className)}
    >
      <LayoutSwitcherItem currentValue={value} value="grid" label={gridLabel} withTooltip={withTooltips}>
        <LayoutGrid className="h-4 w-4" />
      </LayoutSwitcherItem>
      <LayoutSwitcherItem currentValue={value} value="table" label={tableLabel} withTooltip={withTooltips}>
        <List className="h-4 w-4" />
      </LayoutSwitcherItem>
    </ToggleGroup>
  );
}
