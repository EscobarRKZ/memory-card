# Memory Card v93 — bounded cloud retry & multi-device correctness

**Status:** browser code and offline regression tests implemented. No actual production-user edits or live Android/iOS network interruption tests.

## Why this exists

Earlier versions saved games locally and reported when cloud transfer failed, but expected a manual retry or later network-online event. Users could leave the app in a stale state after temporary API outages, 429 rate limits, mobile background suspensions or timeouts.

## Retry rules

- The client classifies temporary connection errors (fetch/network failure, timeout, offline) or HTTP 408, 425, 429 and common 5xx gateway/server failures as transient.
- An automatic retry burst contains at most **5 retries**; delays increase from about 1.5, 3, 6, 12 and 24 seconds with a bounded ±20% jitter to avoid every client retrying at once.
- HTTP 400/401/403/422, invalid data, wrong-account state and version/CAS conflicts are never automatically retried. After five failures the client shows a clear explanation and waits for a manual request or an online event.
- When a browser reports offline, do not run retry timers; resume once it signals online. This saves mobile battery and server quota.
- Sign-out or account switch cancels the previous user's timer. A token refresh for the same account does not reset the retry budget.
- Manual sync resets the attempts; a clean successful sync also resets them.

## Data-loss safeguards

**Never blindly replay an unacknowledged mutating request.** A cloud RPC may have been accepted even if the response was lost. A retry therefore starts with a **fresh full cloud read** and recalculates the merge and server-side compare-and-swap plan. When the prior request partly committed, the next read may identify unknown-base conflicts: they remain visible for manual selection and no silent overwrite occurs.

The application still depends on the previously deployed `save_games_if_unchanged` server RPC. Direct grants on `public.games` remain for legacy PWA clients until real-device compatibility verification; v93 does not broaden or revoke them.

The retry helper `cloud-retry-v93.js` only classifies errors and computes delays. It never sends network requests itself. `backend-v2.js` performs account-bound scheduling and checks that the signed-in UID is still the same before retrying.

## Verification checklist before public signup

1. With a disposable authenticated account, edit a game offline and inspect local persistence; reconnect and verify exact notes/status and server revision.
2. Simulate a 503 before a full cloud read: confirm the client waits and re-downloads without clearing local games.
3. Simulate a failure after the server accepted a write: confirm follow-up sync re-downloads first, and never creates duplicate rows.
4. Edit the same game on another device during a retry: the conflict should be visible and never overwrite either version automatically.
5. Switch accounts or sign out during the countdown: there must be no further old-account API writes.
6. Trigger repeated rate-limit failures and ensure at most five automatic retries until manual restart.
7. Run from installed Android PWA and iOS Safari with browser in foreground/background; account isolation and local backup restore still require verification.

**No live production user was used as an error-injection fixture.**
