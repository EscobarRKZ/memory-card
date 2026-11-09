# Memory Card v94 — friend invitation concurrency and blocked-profile access

**9 November 2026. Deployed migration:** `supabase/migrations/20261109065016_social_pair_lock_and_block_read_guard_v94.sql`.

## The defect before v94

The original `accept_friend_request(friendship_id)` simply updated an incoming pending row; it did not recheck whether either party had blocked the other, nor did it use the same PostgreSQL per-pair advisory lock as `send_friend_request` and `block_user`. Under concurrent block/accept requests the operation ordering could be ambiguous. Likewise, `get_friend_profile` tested for an accepted friendship but did not independently check `mc_private.user_blocks`.

## New server invariants

- `accept_friend_request`: derive recipient from `auth.uid()`; find only the recipient's pending invitation, then use `pg_advisory_xact_lock(hashtextextended('mc_pair:' || least(uid1,uid2) || ':' || greatest(...),0))` on the same unordered pair. After the lock, check blocks in **both** directions and `UPDATE` only if the invitation remains pending and addressed to the same account.
- If the block wins the pair lock, it removes the invitation and acceptance returns `false`. If acceptance wins first, the following block removes the newly accepted friendship. A blocked relationship cannot survive as accepted once both transactions commit.
- `get_friend_profile`: authenticated caller only; resolve target by exact Memory Card ID; take the same pair lock and deny with `NOT_FRIENDS` if blocked in either direction, before fetching game titles, owned platforms and statistics. Existing privacy boundary (accepted friends only; no private notes, no Backlog) is preserved.
- `social_state`: the three social lists additionally exclude peers with any mutual block row. This is defense in depth and does **not** turn a social list read into a globally serialized transaction.
- These are `SECURITY DEFINER` functions with schema-qualified relations and empty `search_path`; `EXECUTE` is revoked for `PUBLIC` and `anon` and granted only to `authenticated`. Existing explicit access checks inside the functions remain essential.

## Front-end experience

When Accept returns `false` (stale or blocked request), the client refreshes social state and displays a non-technical message instead of claiming a friendship exists. Existing successful and rejected request flows remain intact. Service Worker/build v94 precaches the new script URL.

## Verification performed

- Migration installed in the existing Supabase project via the normal migration mechanism.
- Production read-only audit: 110 game records, 2 existing Auth accounts, 0 friendships, 0 blocks, 0 reports and 0 invite audit events; no existing user data changed.
- Privilege and definition introspection confirmed empty search paths, mutual-block guard for all three functions, the matching pair lock on acceptance and profile read, and no `anon` execute privilege.
- An ephemeral, unaffiliated JWT-subject smoke invocation checked the missing-target outcomes without creating Auth identities, friendships or game rows.
- Offline CI checks static SQL protections and simulates an invitation deleted remotely before a recipient taps Accept.

## Not established / public release gates

A real concurrency integration test with **two disposable users** remains mandatory, including parallel requests that acquire the pair locks in either order, a reversed block, already-accepted friendships, same-user rejection, and post-block response content. Old clients, account deletion, public signup, published support contact, third-party cover licenses, Android App Bundle and native device testing remain incomplete.

Supabase's current guidance for privileged API functions: https://supabase.com/docs/guides/database/functions. This migration makes no assertion of general social-system certification.
