-- Memory Card v88 — private, rate-limited user reports.
-- This migration never creates a moderation punishment, deletes a user, or rewrites games.
-- Moderation review is a separate human/operational process.
create table if not exists mc_private.user_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','privacy','inappropriate','other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','closed')),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  constraint mc_user_reports_no_self check (reporter_id <> target_id)
);
create index if not exists mc_user_reports_sender_time
  on mc_private.user_reports(reporter_id,created_at desc);
create index if not exists mc_user_reports_queue
  on mc_private.user_reports(status,created_at);
alter table mc_private.user_reports enable row level security;
revoke all on table mc_private.user_reports from public, anon, authenticated;

-- Only signed-in callers can submit a report. The target is resolved from
-- an exact Memory Card ID and the reporting UID is always auth.uid().
-- The operation is intentionally separate from blocking, suspending or banning.
create or replace function public.report_user(
  target_memory_id text,
  report_reason text,
  report_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_reason text := btrim(coalesce(report_reason,''));
  v_details text := btrim(coalesce(report_details,''));
  v_id uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(target_memory_id,''))) > 64 then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_reason not in ('spam','harassment','privacy','inappropriate','other') then
    raise exception 'REPORT_INVALID_REASON' using errcode='22023';
  end if;
  if char_length(v_details) > 1000 then
    raise exception 'REPORT_TOO_LONG' using errcode='22023';
  end if;
  select user_id into v_target from public.profiles
  where upper(memory_id) = upper(btrim(target_memory_id));
  if v_target is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_target = v_me then
    raise exception 'SELF_REPORT' using errcode='22023';
  end if;

  -- Serialize a sender's reporting transactions, including concurrent tabs.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mc_report_sender:' || v_me::text, 0));

  -- Idempotent if the same target/reason is reported again in 24 hours.
  select id into v_id
  from mc_private.user_reports
  where reporter_id = v_me and target_id = v_target and reason = v_reason
    and created_at > clock_timestamp() - interval '24 hours'
  order by created_at desc
  limit 1;
  if v_id is not null then return v_id; end if;

  if (
    select count(*) from mc_private.user_reports
    where reporter_id = v_me
      and created_at > clock_timestamp() - interval '24 hours'
  ) >= 3 then
    raise exception 'REPORT_RATE_LIMIT' using errcode='P0001';
  end if;

  insert into mc_private.user_reports
    (reporter_id,target_id,reason,details)
  values (v_me,v_target,v_reason,v_details)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.report_user(text,text,text)
from public, anon;
grant execute on function public.report_user(text,text,text)
to authenticated;
