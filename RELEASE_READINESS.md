# Memory Card — Google Play release readiness

Reviewed: 2026-11-07. This document tracks launch gates, not a declaration that the app is ready to publish.

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

## Stage 2 — conflict-safe multi-device sync

- [ ] Replace unconditional last-write upsert with a server-validated conflict rule so an offline device cannot overwrite a newer cloud revision.
- [ ] Avoid reuploading unchanged records and add retry/backoff for transient failures.
- [ ] Implement full per-account local storage separation and safe account switching (the v80 guard intentionally blocks mixing accounts).
- [ ] Simulate multiple devices editing, deleting, restoring and reinstalling with the same and different accounts.
- [ ] Make backups easy to find, export, restore and verify.

## Stage 3 — identity and privacy controls

- [ ] Add secure in-app account deletion and an external deletion-request webpage, with authentication, user confirmation, full data lifecycle and retention documentation.
- [ ] Publish an accurate privacy policy and support/contact page.
- [ ] Map all SDKs, analytics, requests, game artwork sources and uploaded/shared data for Google Play Data safety.
- [ ] Rate-limit friend requests and audit all social RPCs and row-level policies with multiple test accounts.
- [ ] Add user blocking/reporting and review moderation obligations; alternatively omit social features from the first release.
- [ ] Review account recovery, public user-name display and profile visibility.

## Stage 4 — Android package and platform experience

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
