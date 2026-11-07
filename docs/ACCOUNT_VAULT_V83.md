# Memory Card v83 — account-local storage and migration

Status: implemented in the v83 branch. This is NOT Google Play production certification or evidence of real-device testing.

## Storage contract

```text
IndexedDB: memory-card-db / state
  main                               active account workspace or empty signed-out workspace
  mc-account-v83:<Supabase UUID>      private local snapshot for that account
  mc-guest-v83                       legacy/unbound guest archive
  sync-backups-v1:<Supabase UUID>     account-specific local backups
  sync-backups-v1                    legacy guest/backups (retained; not destroyed)
  catalog-v1                         shared public catalogue metadata
```

Application writes to active `main` and the named account key use a **single IndexedDB transaction**. An old v83 tab that still belongs to another account is not allowed to overwrite `main` after the owner changes. Account activation/deactivation also writes both keys atomically.

## Migration from v82

- If `main.settings.cloudOwnerUid` identifies the currently authenticated Supabase user, v83 preserves that workspace and creates its account-scoped mirror.
- If the current account differs, v83 stores the prior workspace under its original UID, then loads the requested account's own snapshot or starts a fresh empty workspace before cloud reconciliation.
- If an old workspace has **no trusted owner**, its games are archived as guest. They are NOT automatically sent to whichever user signs in.
- The account page offers **"Перенести недостающие игры"** only if guest game IDs are absent from the current account. It imports just those games, never guest secrets/settings, and leaves the original guest archive intact.
- Known legacy backup sets are copied to the proper account backup namespace when it is safe to identify the previous owner. The legacy key is deliberately not deleted.

## Safe logout

The local account snapshot is persisted before the main workspace is cleared. Only after that transaction succeeds does the application sign out from Supabase. If sign-out fails, v83 attempts to restore the prior workspace. Social identity and open game details are reset.

## What this does NOT guarantee yet

- Browser profiles and IndexedDB are not encrypted vaults. Someone with access to the device/browser profile can inspect local stored data. Sign-out hides one account from the application UI, not from browser developer tools.
- Old installed v82 and earlier clients do NOT respect the new local workspace protocol. In particular, an old tab on the same origin could still write the legacy `main` key. Close or update all open tabs before relying on account switching.
- Existing direct `public.games` write grants are still open for old PWA versions. The separate server CAS Phase B migration must wait until v82+ real-device verification.
- Supabase auth expiry/recovery, guest import, local storage quota errors, browser multi-tab sessions and two *real* user logins must be tested on Android and desktop before public signup.
- Clearing browser data removes account-local caches; signed-in users should rely on the cloud plus an exported JSON backup.

## Suggested test pass

1. Sign into test account A, add a new entry, check the cloud confirmation, sign out.
2. Sign into test account B using the same browser; verify A's games/notes and friends are not visible, and B's own games are available.
3. Return to A; verify its local library and backup, and recheck cloud sync.
4. Import two legacy guest games (one duplicate ID, one new); confirm the duplicate is untouched and archive remains.
5. Keep an old A tab open while B is active, try a local save in A and verify the active B workspace is unchanged. This protects v83-only tabs; update any older tab before this test.
6. Repeat after offline/online transitions, app restart, permission denied/storage full, and a complete PWA update.
