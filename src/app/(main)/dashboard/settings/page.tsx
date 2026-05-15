"use client";

import { useSearchParams } from "next/navigation";

import { SystemSettingsContent } from "./_components/system-settings-content";

export default function SettingsPage() {
  const searchParams = useSearchParams();

  return <SystemSettingsContent mode="page" tabQuery={searchParams.get("tab")} />;
}
