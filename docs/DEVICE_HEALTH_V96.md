# Memory Card v96 — device & cloud health diagnostics

**Release:** Browser/PWA build v96, 9 November 2026. User-facing functionality, no database migrations.

## How it works

Open **Settings → Data & sync → Device & cloud diagnostics**. The check does nothing in the background. Press **Run diagnostics** to collect a report; optionally press **Download sanitized report** to keep a JSON file on your device.

The check displays:
- Active (not deleted) game records currently in the in-memory account workspace, including Backlog.
- **Active cloud records for the signed-in account only** via Supabase `from('games').select('id',{count:'exact',head:true}).eq('user_id',session.user.id).is('deleted_at',null)`. The server returns a count without returning game rows. The user's RLS policy still applies. If not signed in, offline, or syncing, the probe is omitted.
- Count of locally available backup snapshots for the current account, not their content.
- Latest client sync state (`ok`, `busy`, `conflict`, `error`, `unknown`), number of conflicts and retry-attempt count.
- Browser-reported connectivity and whether a service worker is controlling the page.
- Estimated website-origin storage usage/quota and whether the browser has granted persistent storage.

**Interpretation:** a difference between local and cloud counts is a prompt to inspect synchronization, **not evidence that data has been deleted**. `navigator.onLine` only indicates the browser's reported connectivity, not that Supabase can be reached. Storage usage/quota are browser-provided estimates, not exact database sizes.

## Explicit storage protection

The **Request persistent storage** control invokes `navigator.storage.persist()` only after a user click. The browser may return false or not support it. A success can reduce eviction risk but does not prevent manual data deletion, disk loss, reinstall, or account recovery problems. Continue to export periodic encrypted/private backups of the gaming archive.

Browser documentation:
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persisted

## Privacy boundary

The JSON file uses an explicit allowlist: `format`, `build`, `checkedAt`, account status (signed in/guest), browser network status, local games/backups counts, cloud games count/status, safe sync status, conflicts/retry attempt counts, storage persistence state, approximate usage/quota, and service-worker-controlled boolean.

**Not present:** account UUID, Memory Card ID, email, game titles, notes, rating details, app settings, passwords, JWT, cloud token, URLs, provider names, raw exception text, external IP or user agent. The app neither uploads nor automatically sends this file; the user decides if and with whom to share it.

An authenticated cloud count is issued only when both the current Auth UID and the owner recorded for the active local workspace match. If the account switches while a request is in progress, the result is discarded.

## Verification and limitations

`tests/test_device_health_v96.cjs` exercises the report allowlist with malicious private fields, mock PostgREST call structure, offline/no-auth/busy bypasses, owner mismatch, an Auth switch during a pending count, optional storage readings, and PWA wiring.

Real Android, iOS, Safari and installed PWA checks are **not** performed by offline CI. There is no automatic telemetry, no server-side observability collection, and no new Supabase table or Auth flow in v96. This is a support aid, not production launch certification.
