-- Memory Card v87: protected blocking and rate-limited invitations.
-- Existing games, profiles and friendships are not rewritten by this migration.
create schema if not exists mc_private;
revoke all on schema mc_private from public, anon, authenticated;

create table if not exists mc_private.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint mc_user_blocks_pk primary key (blocker_id, blocked_id),
  constraint mc_user_blocks_no_self check (blocker_id <> blocked_id)
);
create table if not exists mc_private.friend_request_events (
  sender_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists mc_friend_request_sender_time
  on mc_private.friend_request_events (sender_id, created_at desc);
alter table mc_private.user_blocks enable row level security;
alter table mc_private.friend_request_events enable row level security;
revoke all on all tables in schema mc_private from public, anon, authenticated;

-- Serialize all invitation/block transitions per unordered pair; never trust caller UID.
create or replace function public.send_friend_request(target_memory_id text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_existing uuid;
  v_existing_status text;
  v_row uuid;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED' using errcode='42501'; end if;
  if length(btrim(coalesce(target_memory_id,'')))>64 then
    raise exception 'USER_NOT_FOUND';
  end if;
  select user_id into v_target
  from public.profiles where upper(memory_id)=upper(btrim(target_memory_id));
  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target=v_me then raise exception 'SELF_REQUEST'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mc_pair:'||least(v_me,v_target)::text||':'||greatest(v_me,v_target)::text,0));
  if exists (
    select 1 from mc_private.user_blocks b
    where (b.blocker_id=v_me and b.blocked_id=v_target)
       or (b.blocker_id=v_target and b.blocked_id=v_me)
  ) then
    raise exception 'FRIEND_UNAVAILABLE';
  end if;

  select id,status into v_existing,v_existing_status
  from public.friendships
  where least(requester_id,addressee_id)=least(v_me,v_target)
    and greatest(requester_id,addressee_id)=greatest(v_me,v_target)
  limit 1;
  if v_existing is not null then
    if v_existing_status='blocked' then raise exception 'FRIEND_UNAVAILABLE'; end if;
    return v_existing;
  end if;

  -- Multiple simultaneous invitations from one client count towards one quota.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mc_sender:'||v_me::text,0));
  if (select count(*) from mc_private.friend_request_events e
       where e.sender_id=v_me and e.created_at>now()-interval '1 hour') >= 10
     or (select count(*) from mc_private.friend_request_events e
       where e.sender_id=v_me and e.created_at>now()-interval '1 day') >= 30 then
    raise exception 'FRIEND_RATE_LIMIT';
  end if;
  insert into public.friendships (requester_id,addressee_id,status)
  values (v_me,v_target,'pending')
  returning id into v_row;
  insert into mc_private.friend_request_events(sender_id,target_id)
  values (v_me,v_target);
  return v_row;
end;
$$;

create or replace function public.block_user(target_memory_id text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED' using errcode='42501'; end if;
  if length(btrim(coalesce(target_memory_id,'')))>64 then return false; end if;
  select user_id into v_target from public.profiles
  where upper(memory_id)=upper(btrim(target_memory_id));
  if v_target is null then return false; end if;
  if v_target=v_me then raise exception 'SELF_REQUEST'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mc_pair:'||least(v_me,v_target)::text||':'||greatest(v_me,v_target)::text,0));
  insert into mc_private.user_blocks(blocker_id,blocked_id)
  values(v_me,v_target) on conflict do nothing;
  delete from public.friendships
  where least(requester_id,addressee_id)=least(v_me,v_target)
    and greatest(requester_id,addressee_id)=greatest(v_me,v_target);
  return true;
end;
$$;

create or replace function public.unblock_user(target_memory_id text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED' using errcode='42501'; end if;
  if length(btrim(coalesce(target_memory_id,'')))>64 then return false; end if;
  select user_id into v_target from public.profiles
  where upper(memory_id)=upper(btrim(target_memory_id));
  if v_target is null then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mc_pair:'||least(v_me,v_target)::text||':'||greatest(v_me,v_target)::text,0));
  delete from mc_private.user_blocks
  where blocker_id=v_me and blocked_id=v_target;
  return found;
end;
$$;

create or replace function public.list_blocked_users()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_me uuid := auth.uid();
  v_result jsonb;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED' using errcode='42501'; end if;
  select coalesce(
    jsonb_agg(jsonb_build_object('userId',p.memory_id,'displayName',p.display_name)
      order by b.created_at desc),'[]'::jsonb)
  into v_result
  from mc_private.user_blocks b
  join public.profiles p on p.user_id=b.blocked_id
  where b.blocker_id=v_me;
  return v_result;
end;
$$;

-- Only RPCs modify friendships; old bundled social UI already uses these RPCs.
-- Prevent direct inserts/deletes from bypassing block and invitation-rate checks.
revoke insert, update, delete on table public.friendships from public, anon, authenticated;

revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.block_user(text) from public, anon;
revoke execute on function public.unblock_user(text) from public, anon;
revoke execute on function public.list_blocked_users() from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.block_user(text) to authenticated;
grant execute on function public.unblock_user(text) to authenticated;
grant execute on function public.list_blocked_users() to authenticated;
