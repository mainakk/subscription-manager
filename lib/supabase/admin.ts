import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for privileged server-side operations only.
 * Bypasses RLS, so every caller must verify the authenticated user first
 * (see lib/supabase/server.ts getAuthenticatedUser) and scope queries by user_id.
 * Never import this file from client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
