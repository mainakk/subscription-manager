import Link from "next/link";

import { SignOutButton } from "@/components/layout/SignOutButton";

export function AppNav() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/dashboard" className="font-semibold">
            Subscription Manager
          </Link>
          <Link
            href="/dashboard"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Sources
          </Link>
          <Link
            href="/history"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            History
          </Link>
        </nav>
        <SignOutButton />
      </div>
    </header>
  );
}
