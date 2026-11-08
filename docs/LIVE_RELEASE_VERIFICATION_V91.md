# Memory Card v91 — release-site verification and remaining blockers

Reviewed on **2026-11-09**. This is a factual build checklist, **not a declaration of Google Play readiness**.

## Live URLs independently checked

| Public address | Observed result |
|---|---|
| https://escobarrkz.github.io/memory-card/ | Accessible; title Memory Card |
| https://escobarrkz.github.io/memory-card/delete-account.html | Accessible external account-deletion resource |
| https://escobarrkz.github.io/memory-card/sw.js | Accessible; reported `const VERSION=90` at audit time |
| https://escobarrkz.github.io/memory-card/manifest.webmanifest | Accessible; project-scoped PWA manifest |
| https://escobarrkz.github.io/memory-card/privacy.html | **404 at audit time**; v91 adds a clearly preliminary public notice |
| https://escobarrkz.github.io/.well-known/assetlinks.json | **404 at audit time**; must be deployed at site HOST ROOT, not within repository project path |

The initial general-web fetcher could not reach GitHub Pages; a separate live page retrieval confirmed access. This is *not* yet a real Android device smoke test or authenticated account-deletion integration test.

## What v91 provides

- `privacy.html`: accessible preliminary privacy disclosure with links to account deletion; intentionally labelled pre-release because verified support contact, precise backup retention and staffed operations are missing. Do **not** submit this as a finalized Google Play privacy policy.
- Public privacy/deletion links in the main page, external deletion page and login/registration overlay.
- `scripts/check-hosted-release.mjs`: a read-only live check of homepage, account deletion, privacy, PWA manifest and exact service-worker release version; no private credentials, cookies, account creation, or destructive actions.
- `.github/workflows/hosted-release.yml`: CI checks the real public site after release commits and on a low-frequency weekly schedule. A transient Github Pages deployment delay is tolerated with bounded retries.
- `scripts/generate-assetlinks.mjs`: strict Android Digital Asset Links statement generator that requires an actual package ID and cert SHA-256 fingerprint. It cannot generate signing keys or invent IDs.
- `android/README.md`: Bubblewrap/TWA prep and the host-root Digital Asset Links blocker.
- `.gitignore`: helps prevent committing keystores, generated APK/AAB, sensitive local environment settings.

## Mandatory before going public

1. Name the responsible developer/legal entity and establish a real private support address. Verify legal privacy policy, processor terms and backup retention.
2. Resolve the Android host-root assetlinks location by controlling `escobarrkz.github.io` root or moving to an owned domain; choose final app package name and signing certificate. Android new-app `targetSdkVersion` must be at least API 36.
3. Test **two disposable Supabase Auth users** for signup, email delivery, two-device sync, user-reporting, and self-service deletion. The two existing real users must not be destruction test fixtures.
4. Configure external SMTP for real off-team signup verification; do not disable email confirmation to bypass limits.
5. Verify rights for third-party game-cover art, finalize takedown process, and establish moderation ownership for pending reports/deletion requests.
6. Build signed Android App Bundle, test domain association and physical Android Chrome/TWA navigation/offline/keyboard/back behavior; complete Google Play Data safety and Play Console requirements.

Public Google Play policy:
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://developers.google.com/digital-asset-links/v1/create-statement

No production game rows or Auth users were changed while preparing v91.
