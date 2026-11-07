# Memory Card v82 — staged server-side game write rollout

As of **2026-11-07**, the authenticated function save_games_if_unchanged(jsonb) has been deployed to Memory Card Supabase with migration version **20261107105332**. **Phase B is NOT active.** Legacy direct table grants remain open.

## Why two phases

Older v80 and v81 PWA installations still issue direct INSERT/UPDATE to public.games, and v80 may send unconditional full-library upserts. Revoking grants before installations accept v82 could interrupt cloud saves. Keeping grants temporarily avoids abrupt service disruption, but means older clients can still bypass server CAS.

## Phase A — completed, additive

- RPC accepts 0–100 changed games, checks authenticated auth.uid(), and ignores any client-supplied user_id.
- New rows: INSERT ... ON CONFLICT DO NOTHING. Existing rows: atomic UPDATE ... WHERE user_id = auth.uid() AND id = requested AND updated_at = expected.
- The server generates the new timestamp; stale versions raise MC_SYNC_CONFLICT. A failure aborts that RPC batch.
- Guests and PUBLIC cannot execute the RPC; authenticated users can.
- v82 client sends changed games exclusively through the RPC, never via direct INSERT/UPDATE fallback.
- Transactional server smoke test exercised create/update/stale rejection and rolled back the test row; actual user's game records were not touched.

## Phase B — NOT YET APPLIED

Before revocation:
1. Verify the **published PWA version v82** works with a signed-in account on a computer and real Android phone.
2. Test edited games, new games, two-device races, offline reconnect, updates and fresh login; verify the server-generated timestamp is retained through sync.
3. Export and verify an off-device JSON backup and ensure backup/recovery of the production database.
4. Communicate that old installations must update before cloud edits work; local saves should remain intact.
5. Confirm RPC execution grants and RLS; perform a disposable-account integration test.

Proposed SQL (do NOT run until these checks succeed):

~~~sql
begin;
revoke insert, update, delete on table public.games from anon, authenticated;
revoke insert, update, delete on table public.games from public;
grant select on table public.games to authenticated;
commit;
~~~

The RPC runs as the function owner but derives its target owner only from auth.uid(). Read access remains protected by existing RLS policies.

Verify afterward:

~~~sql
select
  has_table_privilege('authenticated','public.games','SELECT') as auth_select,
  has_table_privilege('authenticated','public.games','INSERT') as auth_insert,
  has_table_privilege('authenticated','public.games','UPDATE') as auth_update,
  has_table_privilege('authenticated','public.games','DELETE') as auth_delete,
  has_function_privilege('authenticated','public.save_games_if_unchanged(jsonb)','EXECUTE') as auth_rpc,
  has_function_privilege('anon','public.save_games_if_unchanged(jsonb)','EXECUTE') as anon_rpc;
~~~

Expected: auth_select=true, auth_insert/auth_update/auth_delete=false, auth_rpc=true, anon_rpc=false.

## Error and recovery rules

- If the RPC cannot be reached, v82 fails closed and keeps local entries; never silently use direct writes.
- After a timeout, fetch cloud data again and perform a three-way merge, rather than blindly retrying an old revision.
- If conflict is detected, preserve local/cloud variants and let the user choose explicitly in Settings.
- Do not instantly restore direct table grants to fix old clients. That reopens the loss-of-data hazard; publish and test a corrected v82+ build instead.
- Complete account switching, settings conflict resolution, and signed-in real-device tests separately.

## Audit result

The live SQL RPC was exercised using a temporary game ID and an authenticated-profile context inside a rolled-back subtransaction. The probe verified ownership enforcement even when the JSON supplied a forged user_id, an initial successful update, a stale update rejection, and absence of a persistent probe row.
