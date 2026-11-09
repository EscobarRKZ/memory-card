# Memory Card — Google Play release readiness

Reviewed: 2026-11-08. This document tracks launch gates, not a declaration that the app is ready to publish.

## Stage 0 — least-privilege database grants (v86)

- [x] Revoke table-wide `TRUNCATE`, `TRIGGER` and `REFERENCES` from `anon` and `authenticated` across current `public` tables in production; verify all removed and that all 110 games and both Auth accounts remain intact.
- [x] Commit the exact deployed migration (`20261107173126`) and preserve existing client write rights during the phased v82 rollout.
- [ ] Audit grants whenever new public tables are created; default privileges may expose new tables unless explicitly restricted.

## Stage 0.5 — Auth email and growth readiness (v89)

- [x] Translate Auth errors into safe, actionable Russian text: account restriction, SMTP quota, confirmation, CAPTCHA, wrong password and network failures.
- [x] Add branded transactional email templates to source control and CI checks; do not include tracking images or individual user data in the templates.
- [x] Document current organization Free subscription, quota estimates, email provider requirements and a no-advertising-first monetization concept.
- [ ] **Critical before public registration:** enable custom SMTP with a verified owned sender domain. Built-in Supabase email supports only project-team recipients, 2 emails/hour; Free project created after June 3, 2026 cannot customize templates while on default SMTP.
- [ ] Upload the verified templates to Supabase Dashboard > Authentication > Email Templates, configure Site URL/redirect allowlist, check sender DNS SPF/DKIM/DMARC and test delivery from a disposable external email address.
- [ ] Confirm hosting of `/memory-card/delete-account.html`, signup confirmation/password reset links and real mobile behavior. Do not claim email delivery is already configured.
- [ ] Enable leaked-password protection in Auth settings; verify rates and CAPTCHA before public registration.

## Stage 0.7 — anonymous API privacy verification (v91)

- [x] Add an anonymous, read-only live Supabase REST API probe for user games, profiles, settings, collections, friend relationships and deletion requests.
- [x] Fail closed if any anonymous request returns user rows or if the private abuse-report schema becomes exposed. Only use the client publishable key; no user JWT, secrets, writes or record contents in logs.
- [ ] Confirm the live API check is passing in GitHub Actions after merge; a successful static policy audit alone is not enough.
- [ ] Follow with **authenticated two-disposable-user tests** for wrong-user access, cross-account writes, stale sessions and server CAS; anonymous checks cannot prove logged-in isolation.
- [ ] Do not revoke direct game table writes from old clients until migration/physical-device testing is finished.

## Stage 1 — cloud safety (v80)

- [x] Read active Supabase policies and current database security advisories.
- [x] Confirm that direct `UPDATE` on `public.friendships` is unavailable to `authenticated`; the restrictive migration is already applied in production.
- [x] Paginate cloud game downloads (400 rows per page, deterministic order) and verify count and unique IDs before merging data.
- [x] Upload large libraries in retryable batches (100 rows each), reporting a partial write as an error rather than success.
- [x] Never push local data after an incomplete initial cloud download.
- [x] Keep the cloud account identity bound only to this device; prevent an accidental cross-account merge and protect identity on JSON import/export.
- [x] Display the distinction between local save and cloud sync failure, and block in-progress cloud transfers from the voluntary PWA update button.
- [x] Provide mock-only regression tests for 1,000+ games, incomplete reads and wrong-account login.
- [ ] Install and smoke-test on a real Android PWA, including loss of connection during upload.
- [ ] Run end-to-end tests with two disposable Supabase users, including an account-switch test. Do not use an actual user's profile as a security test fixture.

**Observed on the active Supabase project on 2026-11-07:** one account has 110 game rows. The `friendships_update_participant` policy is absent and `authenticated` lacks `UPDATE` privilege; six authenticated social RPCs use `SECURITY DEFINER`, by design, and require explicit authorization/abuse testing. Supabase security advisors also flagged leaked-password protection being disabled; enable and verify it in Auth dashboard before public signup. This code change does not modify production database policies.

## Stage 2 — conflict-safe multi-device sync (v82: server RPC deployed; lockdown pending)

- [x] Replace unconditional **frontend** game upserts with three-way comparisons and per-game SQL UPDATE predicates that check the exact previously read `updated_at` value. Duplicate new IDs are prevented by the existing composite primary key.
- [x] Avoid reuploading unchanged games; batch newly created games in chunks of 100.
- [x] Keep a **device-local** last-acknowledged snapshot for each game; preserve and explicitly present conflicting local/cloud versions rather than automatically choosing one using client clocks.
- [x] Offer user-confirmed conflict resolution in Settings. Both variants are archived locally and included in profile JSON exports; archived variants are never uploaded automatically.
- [x] Run simulated two-device tests for offline edits, conflicting writes, explicit resolution, concurrent races, partial reads and large initial imports.
- [x] Deploy an authenticated **server-side compare-and-swap RPC** in Supabase (migration `20261107105332`) and switch the v82 client to use it exclusively. Tested create/update/stale rejection in a rolled-back SQL probe; no live game rows changed.
- [ ] **Rollout phase B (still required):** revoke direct `INSERT/UPDATE/DELETE` on `public.games` from `anon` and `authenticated` after v82 PWA is smoke-tested with a signed-in account. Until then older v80/v81 clients can still bypass server-checked writes.
- [ ] Implement exponential retry/backoff for transient failures; current behavior retries on reconnect and explicit user sync.
- [x] v83: atomic per-account IndexedDB workspaces; safe sign-out clears active main state; known guest/legacy games are retained separately and may be imported manually without overwriting matching IDs. Legacy backups move to their owner's namespace when known.
- [ ] Verify multi-tab behavior on real browsers and old v82 PWA tabs. New v83 tabs refuse stale writes to a workspace owned by another account; older clients cannot enforce the same safeguard.
- [ ] Run end-to-end login/logout/account switching on real Android and desktop with two disposable Supabase identities.
- [ ] Run authenticated end-to-end tests against a disposable Supabase environment and real Android devices, including deleting/restoring games and two simultaneous writers.
- [ ] Make backups easy to find, export, restore and verify.

**Important (2026-11-07):** Phase A of v82 is live: the authenticated RPC exists and new game writes will use it exclusively. Phase B direct-table-write lockdown is **not active** yet, so old PWA clients can still bypass CAS. Keep public signup closed until the lockdown, signed-in testing, and account/privacy work are complete. See [SERVER_CAS_ROLLOUT_V82.md](docs/SERVER_CAS_ROLLOUT_V82.md).

## Stage 2.5 — account-safe local recovery (v92)

- [x] v92: local backup list for current signed-in identity, manual snapshot, per-copy download, restore with owner verification and a pre-restore snapshot.
- [x] v92: import missing game IDs only; reject foreign or internally inconsistent account owners, malformed IDs/years, duplicate keys and excessively large files. Never overwrite existing games or import private account settings through JSON.
- [x] v92: export a portable JSON without local secret tokens, prior cloud revision baselines or legacy sheet-sync credentials. Export includes an account owner identifier for later import ownership checks; warn that private notes and game lists remain in the file.
- [x] v92: single IndexedDB read-modify-write transaction for snapshots, refusing cross-account changes or malformed backup stores.
- [x] v92: known offline legal/privacy pages retain their identity; unknown offline routes no longer fall through to the app shell.
- [ ] Verify local backups/guest import/restore, account switching, disk full, offline-to-online cloud convergence and JSON import on real Android and iOS.
- [ ] Provide a fully interactive, encrypted-at-rest optional backup channel with user-held recovery keys only after an explicit threat model; v92 local browser storage is **not encrypted**.
- [ ] Consider checksum signatures and cryptographic integrity for externally transferred JSON files; v92 performs strict structural checks but no cryptographic proof of authorship.

## Stage 2.6 — transient cloud failure resilience (v93)

- [x] Add bounded, jittered exponential backoff for temporary Supabase/network errors: up to 5 automatic retries per attempt burst. No indefinite polling when the service stays unavailable.
- [x] Before each retry, read the cloud library again and rerun revision-aware merge and server CAS; do not replay previous mutating RPC payloads or write directly to public.games.
- [x] Never retry CAS conflicts, account mismatch, malformed requests, 401/403 or permission errors automatically. Local games and notes stay on device.
- [x] Stop retry timers on account changes, sign-out, success and conflict. Expose retry status to the signed-in user and allow manual reset.
- [ ] Test live iOS/Android offline transitions, 429/503, long uploads, process suspension and multi-device conflicts with **disposable** test accounts. Current CI uses a simulated Supabase server; no production user data was modified.
- [ ] Monitor real p95 sync latency, failure categories and server usage once telemetry/privacy policy and an operational process exist.

## Stage 3 — identity and privacy controls

- [x] v88: private `report_user` RPC and `mc_private.user_reports` table, five validated reasons, optional note up to 1000 chars, three new reports per rolling 24h, 24h duplicate suppression.
- [x] v88: explicit report form and shortcuts from incoming invites, friend profiles and blocked list, plus test and runbook `docs/MODERATION_OPERATIONS_V88.md`.
- [ ] Assign a real moderator, private support address, documented review cadence, urgent escalation and appeal process. A database queue without staffed review is **not** operational moderation.
- [ ] E2E report authorization/limits/retention on two disposable Auth accounts, including malformed input, cross-account access, and Android/iOS device flows.



- [x] v87: add block/unblock and read-only blocked list RPCs, protected in a non-exposed private schema; prevent blocked pairs from re-inviting each other.
- [x] v87: rate-limit newly created invitations to 10/hour and 30/day with server-only durable request event history; revoke direct client mutation rights to friendships.
- [ ] Verify block/unblock/rate-limit and simultaneous racing invites with two disposable identities on actual clients. Existing social RPCs are still privileged and require broader abuse testing.
- [ ] Define operational retention for friend-request event logs and user-block data (currently retained until account deletion).

- [x] v84: create an authenticated, RLS-restricted account deletion **request** from Settings and from a standalone browser URL; prevent duplicate requests and show pending status. Requests do NOT delete the account.
- [x] v85: deploy a JWT-protected, password-verified, **self-service hard-deletion** Edge Function and external final confirmation UI. Requires an existing own pending request and verifies the target with Auth, not request JSON. Code and mocked security tests complete.
- [ ] Verify hard deletion end-to-end with **disposable Supabase Auth accounts** (not the personal profile), checking all cascading data and old login/session behavior.
- [ ] Establish monitoring and reliable manual processing of pending requests **not completed via the self-service flow**; publish accurate backup retention and operating procedure. A queued request with no operator remains incomplete.
- [ ] Verify that the public deletion URL actually loads on GitHub Pages and works with test accounts outside the PWA.
- [ ] Publish an accurate privacy policy and support/contact page.
- [ ] Map all SDKs, analytics, requests, game artwork sources and uploaded/shared data for Google Play Data safety.
- [ ] Rate-limit friend requests and audit all social RPCs and row-level policies with multiple test accounts.
- [ ] Add user blocking/reporting and review moderation obligations; alternatively omit social features from the first release.
- [ ] Review account recovery, public user-name display and profile visibility.

## Stage 3.2 — social block/race safety (v94)

- [x] v94: `accept_friend_request` uses the same unordered-pair advisory transaction lock as sending and blocking, then rechecks the block table and pending invitation before updating a friendship.
- [x] v94: `get_friend_profile` locks the pair and returns `NOT_FRIENDS` whenever either user has blocked the other, before reading the target library.
- [x] v94: `social_state` filters blocked peers from the friends, incoming and outgoing lists even if a relationship row remains temporarily.
- [x] v94: these three server RPCs use an empty `search_path` and remain callable only as `authenticated`; the client clears a stale invitation when the server rejects acceptance.
- [x] Deploy the `20261109065016` migration to the current project, preserve live data and verify production function definitions/privileges and unaffiliated-JWT smoke contract.
- [ ] **Still required:** two disposable, real Supabase Auth identities exercising concurrent block/accept, unblock/reinvite, both-direction block, direct API permissions and profile visibility with signed-in clients and physical devices. Offline static/mock CI is not a concurrency proof.
- [ ] Audit the remaining social `SECURITY DEFINER` RPCs and broader client RLS grants; public signup is not cleared by this patch alone.

## Stage 3.5 — game cover rights and privacy (v90)

- [x] v90: per-device, opt-in third-party cover display. Default off; local game data and cloud cover URLs persist unchanged.
- [x] v90: gate artwork requests from cards, hero backgrounds, collection stacks, PS3/Switch/Wikipedia DOM enhancers, manual picker, bulk refresh and PNG share export.
- [x] v90: stop app-owned cross-origin artwork caching and delete the old artwork CacheStorage bucket on v90 SW activation, without affecting unrelated caches.
- [x] v90: show technical cover source and explicitly label image copyright clearance as unknown; inventory available in `docs/COVER_ART_RIGHTS_V90.md`.
- [ ] **Release-blocker:** verify copyright and contract rights for all third-party images distributed in a public/commercial app, including store screenshots. User consent is NOT a copyright license.
- [ ] Contact GameTDB (website permission is specifically required by their FAQ); verify artwork rights for Libretro, AldoTools, HexFlow and each Wikimedia file.
- [ ] Create a reviewable licensing/attribution ledger and a workable publisher complaint/takedown path that can remove artwork without deleting games.
- [ ] Real-device network audit: disabled/on state, CSS backgrounds, PWA image cache, manual picker, sharing/export, account switching and offline behavior.

## Stage 3.6 — verified public hosting and Android association (v91)

- [x] Public v90 site, deletion page and Service Worker were reached independently on 2026-11-09; deployed worker reports version 90.
- [x] Create a publicly accessible **pre-release** privacy notice (`privacy.html`) with direct route to deletion; cache it in v91 and link it from authentication and external deletion pages.
- [ ] Publish **final** policy with verified controller/legal contact, precise retention/backups, data processors and rights/takedown procedure. Preliminary disclosure alone does not qualify as a completed Google Play privacy policy.
- [ ] Publish Digital Asset Links at `https://escobarrkz.github.io/.well-known/assetlinks.json` (host root). Existing repo path `/memory-card/` is not the root; the address returned 404 as of 2026-11-09.
- [ ] Decide owned Android application ID and signing key / Play App Signing certificate; only then generate and deploy the real assetlinks statement.
- [ ] Run authenticated disposable-user deletion/sync tests and real Android/iOS device smoke tests before closing release gates.

## Stage 4 — Android package and platform experience

- [x] v86: pin browser Supabase SDK to exact version `2.95.0`, add static release-integrity checks and service worker regression test to CI.
- [ ] Verify the pinned CDN resource and real GitHub Pages loading on supported phones; add subresource-integrity or self-hosting after verifying browser bundle provenance.
- [ ] Target Android **16 (API 36)** for a new phone app under the Google Play requirements effective August 31, 2026; confirm at actual Play Console submission. See [PLAY_RELEASE_GATE_V86.md](docs/PLAY_RELEASE_GATE_V86.md).

- [ ] Package as a signed Android App Bundle (TWA or equivalent) with verified domain association.
- [ ] Verify current Google Play target SDK/API requirements before upload.
- [ ] Test navigation Back behavior, screen rotation, soft keyboard, insets, accessibility, offline and app-resume.
- [ ] Pin and audit the external Supabase SDK and any other web dependencies; add integrity/dependency monitoring.
- [ ] Integrate privacy-conscious crash reporting, with personal notes and user IDs excluded.

## Stage 5 — legal, store listing and release

- [ ] Verify cover-art/metadata redistribution rights and third-party API/license terms, including console marks.
- [ ] Create original store graphics, screenshots, short and long description, contact/support and required disclosures.
- [ ] Complete content rating, privacy forms and the applicable closed-test requirement.
- [ ] Release to internal and closed testers; collect feedback and fix blocking defects before production.
- [ ] Confirm the public deployed origin serves the tested version and its service-worker update path.

## Hard launch gates

Do not call Memory Card public-release-ready until: account and social access are tested; cloud sync survives 1,000+ games and two devices; users can delete accounts; legal and privacy documents are published; the Android bundle passes review and real-device testing.
