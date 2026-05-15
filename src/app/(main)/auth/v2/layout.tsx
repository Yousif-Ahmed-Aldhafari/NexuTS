import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-background px-6 py-10">
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
