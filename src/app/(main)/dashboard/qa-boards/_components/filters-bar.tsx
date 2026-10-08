"use client";

import type { ReactNode } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FiltersBar({
  children,
  resultCount,
  onClear,
  clearDisabled = true,
}: {
  children: ReactNode;
  resultCount: number;
  onClear: () => void;
  clearDisabled?: boolean;
}) {
  return (
    <div className="rounded-container border bg-card p-3">
      <div className="flex flex-wrap items-end justify-between gap-2 rtl:flex-row-reverse">
        <div className="flex flex-1 flex-wrap items-end justify-start gap-2 rtl:justify-end">{children}</div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-muted-foreground text-xs">{resultCount} results</span>
          {!clearDisabled && (
            <Button variant="ghost" size="sm" className="h-9" onClick={onClear}>
              <X className="mr-1 h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FilterItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-[150px] gap-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children}
    </div>
  );
}
