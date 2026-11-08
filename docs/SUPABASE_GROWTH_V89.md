# Memory Card v89 — verified Supabase Free limits and capacity planning

**Snapshot:** 2026-11-08, live organization `EscobarRKZ` plan `free`; Supabase project `memory-card` in `ap-northeast-2` (Seoul). A live read-only SQL check returned **2 Auth users, 110 games, 12 MB database size and 168 kB total size for public.games**, including its indexes. This is a sample of two existing users, **not** a load test.

## Official published Free quotas (check again before public launch)

- 50,000 monthly active Auth users (MAU), not a hard cap on lifetime account registrations.
- PostgreSQL 500 MB included quota per project; free Nano compute, limited CPU/memory. Project disk size may be larger; the billing quota still applies.
- 5 GB uncached egress + 5 GB cached egress, including Auth, Database, Storage and Edge Function responses.
- 1 GB file storage, 500,000 Edge Function invocations and 2,000,000 Realtime messages per month, 200 concurrent Realtime peak connections.
- Two active Free projects total for the organization. In this organization both slots are in use by Memory Card and Mochi.
- Inactive Free projects may pause after 7 days.
- Default Auth email is not usable for public signup: only pre-authorized team recipients and 2 email sends/hour. Custom SMTP is a release blocker.

Official sources:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/auth/auth-smtp

## Practical capacity estimate — assumptions, NOT a production guarantee

An existing `public.games` table containing 110 rows occupies about 168 kB at this point: roughly 1.5 kB per saved game including table/index overhead. This observation is not guaranteed to generalize: long notes, larger collections, indexes and bloat affect real storage.

If future users average 100 games, a *naïve linear extrapolation* is approximately 150 kB for the game rows/indexes per account. After the initial 12 MB of database structure and current data, 488 MB remains under the 500 MB Free quota: mathematically ~3,200 additional accounts at that density. This is **not a recommended safe account limit**: Postgres compute, query patterns, vacuum/bloat, social data, settings, metadata and egress may constrain growth earlier. Use live measurements and leave headroom.

For example, a complete cloud library download may consume tens or hundreds of KB depending on cover URLs, notes and game counts. Multiply by uploads, re-logins and multi-device syncing. The 5 GB uncached egress allowance can be exhausted before 50k MAU.

## Growth checkpoints

- Internal 2–20 people: verify privacy, account deletion, multi-device sync, SMTP, rate limits, actual host and real devices.
- Closed 20–200 testers: observe p95 sync latency, database size per user/game, data egress, Auth failures, email delivery, error rate and CAS conflicts.
- 200–1,000 active users: assess paid plan and backups; avoid deploying a viral campaign on a Free project with no support/sender.
- 1,000+ active: model cost using measured egress/user/month, game rows/user, login events and conversion, not just the 50k MAU quota.

## Pro consideration

Published Supabase Pro starts at **$25/month**, with 100k included MAU, higher database and egress quotas, daily backups and better production reliability. Subscription applies to the **organization**, and additional projects can incur additional compute cost (official pricing lists additional projects from $10/month). Since this organization currently has both Memory Card and Mochi, evaluate the **combined organization bill**, not a fictional $25 charge for just one project.

**Do not upgrade without owner approval and an explicit cost check.** This document does not change billing.

## Read-only SQL you can use in the Supabase Dashboard

```sql
select
  (select count(*) from auth.users) as registered_accounts,
  (select count(*) from public.games) as game_rows,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  pg_size_pretty(pg_total_relation_size('public.games')) as games_table_and_indexes;
```

For actual Auth MAU, egress, Edge Function and Realtime usage, use **Supabase Dashboard > Usage**, since PostgreSQL table counts alone cannot measure them.
