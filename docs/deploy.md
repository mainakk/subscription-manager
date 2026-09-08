# Deploy (M4)

Vercel + hosted Supabase. No extra infrastructure: no cron, no workers,
no background jobs — sync and enrichment run as chunked route handlers
(see `docs/architecture.md`).

## One-time setup

1. Create the Vercel project from this repo (Next.js preset; no custom
   build command, no `vercel.json` needed).
2. Apply migrations to the hosted database and verify:
   ```
   npx supabase link
   npx supabase db push
   npx supabase db query --linked "select count(*) from public.categories;"
   ```
   Expect 25 category rows.
3. Set environment variables in Vercel (Production + Preview). Same names
   as `.env.example`; values are per-environment:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `NEXT_PUBLIC_SITE_URL` = the deployed URL
     (e.g. `https://your-app.vercel.app`) — used to build the OAuth
     callback URL, so it must match exactly, no trailing slash
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (server only)
   - `YOUTUBE_TOKEN_ENCRYPTION_KEY` (generate once, reuse across
     deploys — rotating it orphans stored refresh tokens)
   - `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` / `ENRICHMENT_MODEL`
4. Google Cloud Console → OAuth client → Authorized redirect URIs, add:
   ```
   <NEXT_PUBLIC_SITE_URL>/api/youtube/callback
   ```
5. Supabase Dashboard → Authentication → URL Configuration:
   - Site URL = `<NEXT_PUBLIC_SITE_URL>`
   - Additional Redirect URLs = `<NEXT_PUBLIC_SITE_URL>/auth/callback`
     (and the localhost equivalents for local dev)

## Deploy

Push to the tracked branch or `vercel --prod`. Verify with:

```
npm run typecheck && npm run lint && npm run test && npm run build
```

## Post-deploy smoke check

1. Open the app, sign in (Google + magic link both work).
2. Connect YouTube → consent shows only `youtube.readonly` +
   `youtube.force-ssl` → dashboard auto-imports.
3. Sync now → count matches expectations; disconnect/reconnect cycle works.
4. Analyze → AI Cleanup counts appear; force-quota failures show the
   quota message with retry guidance, not a raw code.
5. Select → review → confirm → bulk unsubscribe reports per-item results.
6. History shows the batch; Data & privacy → delete removes everything.

## Notes

- Preview deployments share the env-var names but should point at a
  staging Supabase project — never production service-role keys.
- Never print env values in logs or error reports; key names only.
- YouTube quota failures (`quota_exhausted`, `rate_limited`) are surfaced
  in the UI with retry guidance; quotas reset over time, no action needed
  on the deployment itself.
