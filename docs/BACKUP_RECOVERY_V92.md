# Memory Card v92 — local backup recovery and safe JSON transfer

**Status:** implemented in browser source, with offline regression tests. This is not a device-tested or cryptographically authenticated backup service.

## How to use

Open **Настройки → Данные и sync → Резервные копии**. The panel shows the ten most recent backups stored in this browser for the *currently active account* (or the guest workspace when signed out).

- **Создать локальную копию:** create a new snapshot without changing games.
- **Экспорт** by a dated snapshot: download a JSON containing those game entries and safe appearance/collection preferences.
- **Восстановить** by a dated snapshot: confirm that the selected account's copy should replace the **local game list**. The app saves the current state to a new `before-restore` snapshot *first*. Current credentials, cloud revision tracking, user ID and sync settings stay unchanged.
- **Скачать мою библиотеку JSON:** download a portable JSON of the current game list, without Auth secrets, legacy sync passwords or cloud revision baselines.
- **Импортировать игры JSON:** accept a valid archive from this account or an unbound legacy export; import *new IDs only*. Conflicting ID values are skipped rather than overwritten. Account preferences and server identity are never copied from the file.

The UI explicitly warns that a restored local library may synchronize to the cloud on a later update. Confirm remote state and other devices after restoring.

## Storage layout and safety

```text
IndexedDB: memory-card-db / state
  main                                 active account workspace
  mc-account-v83:<supabase-user-id>     per-account active mirror
  sync-backups-v1:<supabase-user-id>    at most 10 local backup snapshots
  sync-backups-v1                      guest/legacy local backups
```

Snapshots are appended through one `readwrite` IndexedDB transaction with an active account-owner check; a stale tab or corrupt existing array aborts. Backups are never implicitly uploaded to Supabase.

A local restore rejects a snapshot if its `settings.cloudOwnerUid` belongs to another account, or when the current account is authenticated but the copy has no verified owner. Valid snapshots can be exported without changing the library. If the browser storage is cleared, these local copies will be lost.

## Import validation

- Input must be a JSON object with an array of games, at most 50,000 rows and a file size of 40 MiB or less.
- Game IDs must be safe alphanumeric / underscore / dash / colon text, max 200 characters, unique within the archive; platform tokens must be plain alphanumeric / underscore / dash, and release year must be 4 digits if set.
- Game title/status, free-text notes, genre/franchise lengths and image URL lengths have bounded validation.
- If `ownerUid` or legacy `settings.cloudOwnerUid` indicates another account, import is rejected. If both are present but disagree, the file is rejected. Old files with unknown owners can be imported only after an explicit warning, and only newly missing game IDs are added.
- Existing ID collisions never overwrite current notes, ratings, status, images or updates. Imported `userId`, `syncSecret`, `sheetEndpoint`, `authToken`, `cloudSyncBaselineV81` and other settings are ignored.
- A local snapshot is made before committing an import, and a failed persistence attempt restores the in-memory games array. This does not erase prior app backups.

## Privacy and caveats

The JSON file **still contains your personal game lists, ratings and notes**, plus the original account's Supabase UID as an ownership guard. Store exports privately and do not send them to strangers. The exported settings include only selected cosmetic/collection preferences. This is not encryption.

Ownership checks are protective consistency checks, **not cryptographic evidence**: a malicious person who can alter a JSON file can also change its owner field. Do not open untrusted backup files casually.

This release does not change the cloud schema, authenticate an imported archive, revoke legacy direct game writes or execute irreversible account deletion. Two disposable authenticated accounts and physical-device tests remain mandatory before public release.

## Offline route correction

When offline, the Service Worker now restores the **cached privacy page to privacy URLs**, the **cached external deletion page to deletion URLs**, and the cached app for the app home route. It no longer serves the home app on an arbitrary unknown route. Authentication and actual account deletion still **require network access**.

## Release validation

CI runs `node tests/test_backup_safety_v92.cjs` plus the existing cloud sync, account vault, PWA integrity and Service Worker tests. Runtime tests are simulated and do not establish that a live iOS/Android device or real account has passed recovery.
