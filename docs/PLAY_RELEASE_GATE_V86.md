# Memory Card v86 — Google Play launch gates and Data safety inventory

**Status: internal audit, not a public privacy policy or completed Play Console disclosure. Reviewed 2026-11-07.**

## What was verified in code and live Supabase

- Production migration `20261107173126` revoked `TRUNCATE`, `TRIGGER`, `REFERENCES` on current public tables from `anon` and `authenticated`. Checked afterward: 110 games, 2 Auth users, no deletion requests, 0 Storage buckets. Legacy game `INSERT/UPDATE/DELETE` still granted while the phase-B rollout is pending.
- Edge Function `delete-own-account` is active with `verify_jwt=true`, validates the current session and password, requires an own pending deletion request, and hard-deletes via server-only privileged client; automated tests are mocks and **not** proof of end-to-end deletion.
- The standalone resource is `https://escobarrkz.github.io/memory-card/delete-account.html` in the source. **Public reachability, form submission and Android/iOS browser behavior have NOT been verified.**
- Browser Supabase SDK is pinned to `@supabase/supabase-js@2.95.0` in all three entry HTML documents; CDN loading and supply-chain integrity still require an online test. The service worker and manual update screen have build 86 and CI checks asset paths.

## v87 social safety (code and database audit; device E2E still required)

- Implemented server-side block/unblock/list RPCs with current-user authorization and an isolated private schema; invitations check both block directions and are limited to 10 per hour and 30 per day. Request history is retained until the sending or target account is deleted.
- Removed client direct INSERT/UPDATE/DELETE grants on `public.friendships`; verified zero existing friendships were modified, no block events were created, and 110 games/2 accounts remain intact.
- The UI now supports blocking from incoming requests and friend profiles and unblocking from a separate list. Still required: disposable-account testing, abuse/race tests and a public reporting/moderation contact path.

## Google Play requirements that affect the Android launch

- New phone apps submitted from 2026-08-31 must target **Android 16 / API 36** or higher. Official policy: https://support.google.com/googleplay/android-developer/answer/11926878
- Because Memory Card supports account creation, deletion must be discoverable **both in the app and via a functioning external web resource**. Completing a request must remove associated data except for disclosed legitimate retention. Official guidance: https://support.google.com/googleplay/android-developer/answer/13327111
- Build a signed Android App Bundle through a TWA or equivalent; verify the HTTPS origin with Digital Asset Links and the actual signing SHA-256. Do not invent a package ID, certificate fingerprint or release key, or commit signing keys to GitHub.
- Verify Play Console account eligibility, any applicable testing requirement, store listing, content rating, support contact, app access instructions and declarations before submitting. Never claim compliance based only on source inspection.

## Data safety source inventory — map before disclosure

| Data/process | Observed source | Next verification |
|---|---|---|
| Login email, credentials, auth metadata | Supabase Auth / `backend-v2.js` | Auth setting, retention, controller/processor disclosures, account recovery |
| Game titles, states, platforms, notes, ratings, collections | `public.games`, `public.collections`, `collection_games`; browser IndexedDB | RLS and friend visibility; deletion E2E; offline backup copies |
| Public profile/memory ID and optional friends | `profiles`, `friendships`, social RPCs | Authorized read exposure, spam controls, moderation/reporting |
| Bot protection | Cloudflare Turnstile in both HTML entry flows | Consent/disclosures, active site key, captcha effectiveness |
| Supabase JS CDN | `cdn.jsdelivr.net` pinned browser SDK | Actual IP/request metadata and third-party processing disclosure |
| Game cover/artwork and search providers | Cover helper scripts / outside image hosts | Enumerate runtime network requests and image redistribution licenses |
| Local device data | IndexedDB, local storage, PWA cache | Account-switch correctness and deletion of data on other devices |

**This table is not a legal or Play Data safety declaration.** It must be reconciled with actual network activity, official processor terms and the final deployed app. Do not describe data as uncollected/unshared without observing real traffic and SDK behavior.

## Remaining blocking acceptance tests

1. Create two disposable Auth accounts with dedicated test data, with no personal data copied from the real accounts. Verify failure on wrong password; submit a request; delete A; check Auth login refusal and absence of A's rows; assert B remains untouched.
2. Open the hosted deletion URL directly from Android Chrome and iOS Safari, with and without the installed PWA. Verify the external request flow, password checks, complete deletion and error/connection handling.
3. On two real devices, test v82+ multi-device syncing, conflicting edits, re-login, offline edits and correct account switching. Only then revoke legacy direct game `INSERT/UPDATE/DELETE`.
4. Ensure a monitored, responsive path for manual pending requests (including people unable to verify a password). Define response/deletion timing, support address and actual backup retention.
5. Publish accurate privacy policy, support details and Play Data safety responses; review social features and artwork/licensing; generate and test API-36 Android bundle and signing/domain association.

## Operational note

The production database was **not** used for a destructive account-deletion test. The only production mutation in v86 was the privilege-revocation migration, followed by read-only verification.
