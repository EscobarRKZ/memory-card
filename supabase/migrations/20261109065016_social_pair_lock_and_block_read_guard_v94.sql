-- v94 social race protection: no game, user or friendship rows are changed.
create or replace function public.accept_friend_request(friendship_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $mc$
declare
  v_me uuid := auth.uid();
  v_sender uuid;
begin
  if v_me is null then return false; end if;
  select f.requester_id into v_sender
  from public.friendships f
  where f.id=friendship_id and f.addressee_id=v_me and f.status='pending';
  if v_sender is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mc_pair:'||least(v_me,v_sender)::text||':'||greatest(v_me,v_sender)::text,0));
  if exists (
    select 1 from mc_private.user_blocks b
    where (b.blocker_id=v_me and b.blocked_id=v_sender)
       or (b.blocker_id=v_sender and b.blocked_id=v_me)
  ) then return false; end if;
  update public.friendships
  set status='accepted',updated_at=now()
  where id=friendship_id
    and addressee_id=v_me and requester_id=v_sender and status='pending';
  return found;
end;
$mc$;
CREATE OR REPLACE FUNCTION public.get_friend_profile(target_memory_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  target_id uuid;
  allowed boolean;
  result jsonb;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(btrim(coalesce(target_memory_id,''))) > 64 then return null; end if;
  select user_id into target_id from public.profiles
  where upper(memory_id)=upper(btrim(target_memory_id));
  if target_id is null then return null; end if;
  -- Serialize profile reads and blocking for the same pair.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mc_pair:'||least(me,target_id)::text||':'||greatest(me,target_id)::text,0));
  if exists (
    select 1 from mc_private.user_blocks b
    where (b.blocker_id=me and b.blocked_id=target_id)
       or (b.blocker_id=target_id and b.blocked_id=me)
  ) then raise exception 'NOT_FRIENDS'; end if;
  select exists(
    select 1 from public.friendships
    where status='accepted'
      and ((requester_id=me and addressee_id=target_id) or (addressee_id=me and requester_id=target_id))
  ) into allowed;
  if not allowed then raise exception 'NOT_FRIENDS'; end if;
  select jsonb_build_object(
    'profile',jsonb_build_object(
      'userId',p.memory_id,
      'displayName',p.display_name,
      'createdAt',p.created_at,
      'ownedPlatforms',coalesce(s.payload->'ownedPlatforms','[]'::jsonb)
    ),
    'games',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,'title',g.title,'platform',g.platform,'status',g.status,'releaseYear',g.release_year,
        'genre',g.genre,'franchise',g.franchise,'coverUrl',g.cover_url,'coverSource',g.cover_source,
        'rating',g.rating,'replay',g.replay,'addedAt',g.added_at,'updatedAt',g.updated_at
      ) order by g.updated_at desc)
      from public.games g
      where g.user_id=target_id and g.deleted_at is null and g.status<>'backlog'
    ),'[]'::jsonb),
    'stats',jsonb_build_object(
      'completed',(select count(*) from public.games g where g.user_id=target_id and g.deleted_at is null and g.status='completed'),
      'playing',(select count(*) from public.games g where g.user_id=target_id and g.deleted_at is null and g.status='playing'),
      'averageRating',(select round(avg(g.rating)::numeric,1) from public.games g where g.user_id=target_id and g.deleted_at is null and g.status='completed' and g.rating is not null),
      'tens',(select count(*) from public.games g where g.user_id=target_id and g.deleted_at is null and g.status='completed' and g.rating=10)
    )
  ) into result
  from public.profiles p
  left join public.user_settings s on s.user_id=p.user_id
  where p.user_id=target_id;
  return result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.social_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select jsonb_build_object(
    'profile', jsonb_build_object('userId',p.memory_id,'displayName',p.display_name),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId',f.id::text,
        'userId',op.memory_id,
        'displayName',op.display_name,
        'completed',(select count(*) from public.games g where g.user_id=op.user_id and g.deleted_at is null and g.status='completed'),
        'playing',(select count(*) from public.games g where g.user_id=op.user_id and g.deleted_at is null and g.status='playing')
      ) order by op.display_name)
      from public.friendships f
      join public.profiles op on op.user_id=case when f.requester_id=me then f.addressee_id else f.requester_id end
      where f.status='accepted' and (f.requester_id=me or f.addressee_id=me) and not exists (
        select 1 from mc_private.user_blocks b
        where (b.blocker_id=me and b.blocked_id=op.user_id)
           or (b.blocker_id=op.user_id and b.blocked_id=me)
      )
    ),'[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId',f.id::text,
        'userId',op.memory_id,
        'displayName',op.display_name
      ) order by f.created_at desc)
      from public.friendships f
      join public.profiles op on op.user_id=f.requester_id
      where f.status='pending' and f.addressee_id=me and not exists (
        select 1 from mc_private.user_blocks b
        where (b.blocker_id=me and b.blocked_id=op.user_id)
           or (b.blocker_id=op.user_id and b.blocked_id=me)
      )
    ),'[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId',f.id::text,
        'userId',op.memory_id,
        'displayName',op.display_name
      ) order by f.created_at desc)
      from public.friendships f
      join public.profiles op on op.user_id=f.addressee_id
      where f.status='pending' and f.requester_id=me and not exists (
        select 1 from mc_private.user_blocks b
        where (b.blocker_id=me and b.blocked_id=op.user_id)
           or (b.blocker_id=op.user_id and b.blocked_id=me)
      )
    ),'[]'::jsonb)
  ) into result
  from public.profiles p
  where p.user_id=me;
  return result;
end;
$function$;
revoke execute on function public.accept_friend_request(uuid) from public, anon;
revoke execute on function public.get_friend_profile(text) from public, anon;
revoke execute on function public.social_state() from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.get_friend_profile(text) to authenticated;
grant execute on function public.social_state() to authenticated;
