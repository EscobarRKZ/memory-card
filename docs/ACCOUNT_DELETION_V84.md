# Memory Card v84 — deletion requests and privacy

Status on 2026-11-07: **request intake implemented**. Automatic deletion is **NOT ENABLED**. This document is an operator runbook, not a public claim of completed Google Play certification.

## User paths

- In Memory Card: Settings → Account → "Запросить удаление аккаунта".
- Without the installed app: open /delete-account.html in a regular browser, sign in with Memory Card credentials, type "УДАЛИТЬ", and submit.
- If a request already exists, the page shows its server status instead of creating duplicate requests.
- Settings includes "Скачать мои данные (JSON)" for a user-controlled backup and a privacy information link.

The request is **non-destructive** and does not automatically close the account. Do not claim otherwise in the store listing.

## Database and privacy model

Migration 20261107131531 creates public.account_deletion_requests with a unique account identifier, pending status and timestamps. The authenticated role can only SELECT and INSERT its own pending request. It cannot UPDATE a request or review it. An unauthenticated user cannot submit one.

The request row contains a Supabase account ID and timestamps; no passwords, game notes or other profile content are stored. The in-browser login page sends passwords only to Supabase Auth; the request itself sends only user_id and status.

Supabase Auth deletion, when performed by an authorized operator, should cascade through games, profiles, user_settings, collections, collection_games and friendships. Before processing actual users, verify the cascade and any Storage objects on disposable accounts. A historical Google Sheets/Apps Script export may require separate attention.

## Manual operator process — required before opening public signup

1. Inspect the request queue in Supabase SQL Editor as an authorized admin. Do not publish identities publicly:

~~~sql
select
  r.id as request_id, r.user_id, u.email, r.status, r.requested_at
from public.account_deletion_requests r
join auth.users u on u.id = r.user_id
where r.status in ('pending','needs_verification','processing')
order by r.requested_at asc;
~~~

2. Confirm the request belongs to the authenticated account and perform any necessary identity/security checks. Do not treat a public GitHub Issue as proof of account ownership.
3. Check whether the account owns any Supabase Storage objects. Deleting an Auth user may fail if it owns objects; resolve that first without affecting unrelated users.
4. Use an authorized Supabase Auth admin workflow to delete the correct account. Never expose a service-role credential in the frontend. Do not use a fabricated test user ID or test against someone's personal library.
5. Verify active cloud records have been removed and the request disappears by cascade. Document processing and retention of infrastructure backups.
6. Tell users what to expect, provide a private support address and automate notifications/reviews before Google Play publication.

The current app's account-local IndexedDB workspaces and exported JSON files may remain on users' devices after server-side account deletion. A complete final deletion UX must provide local cleanup and explain that externally saved files must be deleted by the user.

## Future automatic deletion (NOT enabled)

A draft Supabase Edge Function is committed at supabase/functions/delete-account/index.ts. It is not deployed or activated. It requires the environment switch MC_ACCOUNT_DELETION_ENABLED=true, live bearer-token validation, password reauthentication, an exact confirmation phrase and server-side admin deletion. It must be reviewed and tested with disposable Auth users before deployment. Do not change that environment switch or deploy the function as an incidental side effect.

## Remaining release blockers

- Verify the public Pages URL loads /delete-account.html and /privacy.html correctly.
- Add a **private** privacy support/contact channel; GitHub Issues are public and cannot handle personal data requests.
- Establish a monitored request-processing process and documented response/retention times.
- Test with two disposable Supabase accounts on real Android and desktop.
- Finalize an accurate non-draft privacy policy and Google Play Data safety questionnaire.
- Complete v82 direct-write grant lockdown after signed-in real-device testing.
