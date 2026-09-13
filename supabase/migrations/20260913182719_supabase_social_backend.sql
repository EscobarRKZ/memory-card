create or replace function public.social_state()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
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
      where f.status='accepted' and (f.requester_id=me or f.addressee_id=me)
    ),'[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId',f.id::text,
        'userId',op.memory_id,
        'displayName',op.display_name
      ) order by f.created_at desc)
      from public.friendships f
      join public.profiles op on op.user_id=f.requester_id
      where f.status='pending' and f.addressee_id=me
    ),'[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId',f.id::text,
        'userId',op.memory_id,
        'displayName',op.display_name
      ) order by f.created_at desc)
      from public.friendships f
      join public.profiles op on op.user_id=f.addressee_id
      where f.status='pending' and f.requester_id=me
    ),'[]'::jsonb)
  ) into result
  from public.profiles p
  where p.user_id=me;
  return result;
end;
$$;

create or replace function public.reject_friend_request(friendship_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.friendships
  where id=friendship_id and addressee_id=auth.uid() and status='pending';
  return found;
end;
$$;

create or replace function public.remove_friend(target_memory_id text)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then return false; end if;
  select user_id into target_id from public.profiles where upper(memory_id)=upper(trim(target_memory_id));
  if target_id is null then return false; end if;
  delete from public.friendships
  where status='accepted'
    and ((requester_id=auth.uid() and addressee_id=target_id) or (addressee_id=auth.uid() and requester_id=target_id));
  return found;
end;
$$;

create or replace function public.get_friend_profile(target_memory_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  me uuid := auth.uid();
  target_id uuid;
  allowed boolean;
  result jsonb;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select user_id into target_id from public.profiles where upper(memory_id)=upper(trim(target_memory_id));
  if target_id is null then return null; end if;
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
$$;

revoke execute on function public.social_state() from public,anon;
revoke execute on function public.reject_friend_request(uuid) from public,anon;
revoke execute on function public.remove_friend(text) from public,anon;
revoke execute on function public.get_friend_profile(text) from public,anon;
grant execute on function public.social_state() to authenticated;
grant execute on function public.reject_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.get_friend_profile(text) to authenticated;