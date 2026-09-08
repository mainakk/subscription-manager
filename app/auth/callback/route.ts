import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (!code) {
    redirect("/login?error=missing_code");
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    redirect("/login?error=not_configured");
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    redirect("/login?error=exchange_failed");
  }
  redirect(next);
}
