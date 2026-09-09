"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function safeNextParam(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = isSupabaseConfigured();
  const next = safeNextParam(useSearchParams().get("next"));
  // Keep the default redirect exactly allowlist-shaped (no query string);
  // only non-default destinations get ?next=.
  const callbackUrl =
    next === "/dashboard"
      ? `${window.location.origin}/auth/callback`
      : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });
      setStatus(
        error ? `Sign-in failed: ${error.message}` : "Check your email for a sign-in link.",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle() {
    setPending(true);
    setStatus(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
        },
      });
      if (error) setStatus(`Google sign-in failed: ${error.message}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <main className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to manage your subscriptions.
        </p>
        {!configured ? (
          <p className="mt-6 rounded-md border border-input bg-muted p-3 text-sm text-muted-foreground">
            Supabase is not configured. Copy .env.example to .env.local and
            set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={signInWithGoogle}
            >
              Continue with Google
            </Button>
            <form onSubmit={signInWithEmail} className="flex flex-col gap-3">
              <label
                htmlFor="email"
                className="text-sm font-medium"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send magic link"}
              </Button>
            </form>
            {status ? (
              <p className="text-sm text-muted-foreground">{status}</p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
