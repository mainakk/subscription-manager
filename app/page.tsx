import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-24">
      <main className="w-full max-w-xl text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          M0 scaffold
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Your information diet
        </h1>
        <p className="mt-3 text-muted-foreground">
          Connect a source to get started. YouTube support lands in M1.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button disabled title="Available in M1">
            Connect YouTube
          </Button>
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Auth + dashboard arrive with M1. This page only proves the App
          Router, Tailwind, and shadcn baseline render.
        </p>
      </main>
    </div>
  );
}
