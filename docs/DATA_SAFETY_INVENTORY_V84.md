# Memory Card — Google Play Data safety inventory (draft)

Reviewed against source in GitHub on 2026-11-07, through PWA build v84. This is a working inventory, **not** the final Play Console declaration. Verify deployed settings and actual network traffic on Android before filing.

| Data / request | Source / destination | Purpose | Notes before Play |
| --- | --- | --- | --- |
| Email, auth credentials, session tokens | Supabase Auth | Account creation, password reset, sign-in | Password handled by Supabase Auth; auth session persists on the device |
| Display name, Memory Card ID | Supabase public.profiles | Identity and friend features | Visible to accepted friends; unique ID lookup requires exact ID |
| Games, consoles, status, year, rating, notes, dates | Supabase public.games; local IndexedDB | Library and cross-device synchronization | Personal notes and Backlog should not be visible to friends; verify server RPC projections |
| Collections and selected platforms | Supabase public.user_settings and local IndexedDB | Personal organization and settings | Check current settings payload for sensitive/local-only fields |
| Friend invitations / friend lists | Supabase public.friendships and authenticated RPCs | Social feature | Review reporting/blocking and abuse protections |
| Account deletion request ID, status, timestamps | Supabase public.account_deletion_requests | Record a request for manual deletion | RLS: own request only; no automated deletion in v84 |
| Browser-local data, theme, backup snapshots | IndexedDB, localStorage, service-worker caches | Offline use, update consent and usability | Separate per-account storage; browser profiles are not encrypted vaults |
| Turnstile challenge data | Cloudflare Turnstile | Login abuse mitigation | Verify Cloudflare privacy terms and Data safety disclosures |
| Third-party JavaScript | jsDelivr (@supabase/supabase-js) | Frontend library | Pin and review exact version/dependency integrity before Google Play |
| Game titles/metadata lookup | Wikidata, Wikipedia, GitHub API and raw assets | Autocomplete, release-year information | Queries may reveal game titles and IP addresses to providers |
| Cover art and proxy image requests | Libretro/GitHub, GameTDB, images.weserv.nl, Wikimedia and related sources | Game covers | Review licenses, hotlink terms, data controller/processor roles and cache retention |
| Legacy sync/export code | Google Apps Script / Google Sheets | Historical fallback/old data | Current Supabase login disables legacy cloud sync; evaluate legacy copies before claiming deletion coverage |

## No unverified claims

Do not state that personal data is never collected, that all communications are completely anonymous, that data is deleted instantly or that server backups disappear instantly. None of those claims have been independently verified.

No dedicated analytics SDK was identified in the inspected app entrypoint, but the public site, CDNs, hosting and providers may record ordinary technical request logs. Confirm this through a real-device network trace before checking Google Play Data safety boxes.

## Product readiness for account deletion

- [x] Authenticated request intake page and in-app link (v84)
- [x] RLS policies restrict request status modification to authorized operators
- [x] Manual operator runbook and non-destructive frontend tests
- [ ] Private privacy/support contact
- [ ] Public URL availability verified without an installed app
- [ ] Manual service process monitored or safe automatic deletion enabled and tested
- [ ] Supabase backup data retention and legacy Google Sheets handling described
- [ ] Verified actual user data deletion with disposable account
- [ ] Store Data safety responses reviewed against actual app behavior

## Platform disclosures / final review

Google Play requires an accurate privacy policy reachable inside the app and on a public web URL, plus truthful Data safety disclosures. If users can register, they must be able to request account and associated data deletion from both the app and an external web resource. Keep the draft label until the support contact, deletion processing and retention information are finalized.

Official Google Play policy: https://support.google.com/googleplay/android-developer/answer/13327111
