# Memory Card v85 — authenticated permanent account deletion

**Deployment:** Supabase Edge Function \`delete-own-account\` version 1, \`verify_jwt=true\`, deployed 2026-11-07. Source: \`supabase/functions/delete-own-account/\`.

**This is an irreversible service endpoint.** Do not call it using the user's personal account to test. Use a disposable test account with an independent backup and explicit test data.

## Required user journey

1. A user opens **Настройки → Аккаунт → Удаление аккаунта** or the standalone page \`/memory-card/delete-account.html\` (works without installing the PWA).
2. They authenticate and submit a **pending deletion request** under their own Supabase UID, enforced by existing RLS; creating a request does not delete anything.
3. On the standalone page, they select permanent deletion, enter the exact phrase **УДАЛИТЬ НАВСЕГДА**, re-enter the **current password**, solve a fresh Cloudflare Turnstile challenge when configured, and confirm one last browser prompt.
4. \`supabase.functions.invoke('delete-own-account')\` sends only the phrase, password and optional captcha token over HTTPS using the signed-in session JWT. There is no editable target user ID in the request.
5. The Edge gateway validates JWT (\`verify_jwt=true\`). The function independently calls \`auth.getUser(token)\`, checks for an existing own **pending** request, and verifies the password again through Supabase Auth using the same email and captcha token.
6. Before deletion, the function checks Supabase Storage buckets. If *any* bucket exists, it **refuses deletion** pending a manual storage-object deletion policy. On 2026-11-07, the project has zero buckets.
7. Only after those checks can the server-side admin client perform **hard deletion** of the authenticated UID. Existing public tables reference \`auth.users(id)\` with \`ON DELETE CASCADE\` (profiles, games, collections, collection_games, settings, friendships, request rows). Supabase Auth must be checked for any future foreign keys before release.
8. Only after \`deleted:true\` from the server does the web page purge that account's named IndexedDB workspace and backups, keeping other users and unidentified guest archives untouched. It attempts local Auth sign-out and warns if cleanup fails.

**No password, bearer token or secret API key must ever be logged, included in GET parameters or stored in browser state/IndexedDB.** The Edge service key is read only from environment variables inside Supabase Functions.

## What is verified

- The Edge Function was deployed with JWT verification and the exact checked-in source.
- Automated tests exercise missing/invalid JWT, wrong request status, no request, incorrect password, identity mismatch, forged user ID, invalid phrase, prohibited origin, occupied Storage, failed Auth deletion and success using mocks. No real users are deleted in automated tests.
- Standalone client and local cleanup have regression tests confirming the selected account only is erased from IndexedDB and guest/other-account records remain.
- Production database checked read-only after deployment: games **110**, deletion requests **0**, Storage buckets **0**. No real account deletion performed.

## What is NOT verified yet

- A complete end-to-end permanent deletion using **a disposable Supabase Auth account**, including sign-in, Turnstile, deletion request submission, hard delete, fresh-login rejection, and cascade checks.
- Real hosted GitHub Pages reachability for \`delete-account.html\` and verified behavior on mobile Safari, Android Chrome and installed PWA.
- Manual processing of already-submitted requests if a user cannot complete the self-service password flow. **Someone must monitor and process pending requests**; the self-service endpoint alone does not execute queued requests.
- Precise Supabase backup retention period, legal retention disclosures and final public privacy/contact policy. Auth deletion cannot erase offline exports or browser data on other devices.
- Subsequent account features may add Storage buckets or new tables; any such changes require reviewing deletion and this function's fail-closed Storage preflight.

## Safe release gate

Use two freshly created disposable accounts **not sharing the user's private data**. Verify an unsuccessful fake password does not delete either; submit request for disposable account A; complete self-deletion; assert its Auth identity and all public tables disappear; ensure B is untouched. Verify the released PWA and website have build v85.

Do not revoke legacy direct-game grants, claim Google Play compliance or publish a final privacy-policy statement solely on these tests.
