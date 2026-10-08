"use client";

import { type ReactNode, useEffect, useState } from "react";

import { createPortal } from "react-dom";

export function DashboardHeaderPath({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("dashboard-header-path"));
  }, []);

  if (!target) return null;

  return createPortal(
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 overflow-hidden [&>span]:truncate">
      {children}
    </nav>,
    target,
  );
}
