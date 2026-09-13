create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory_id text not null unique,
  display_name text not null default 'Игрок',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  platform text not null,
  status text not null check (status in ('completed','playing','dropped','backlog')),
  release_year text not null default '',
  genre text not null default '',
  franchise text not null default '',
  cover_url text not null default '',
  cover_source text not null default '',
  rating smallint check (rating between 1 and 10),
  replay integer not null default 0 check (replay >= 0),
  notes text not null default '',
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id,id)
);

create index if not exists games_user_status_idx on public.games(user_id,status);
create index if not exists games_user_updated_idx on public.games(user_id,updated_at desc);

create table if not exists public.collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  emoji text not null default '📚',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id,id)
);

create table if not exists public.collection_games (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id text not null,
  game_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id,collection_id,game_id),
  foreign key (user_id,collection_id) references public.collections(user_id,id) on delete cascade,
  foreign key (user_id,game_id) references public.games(user_id,id) on delete cascade
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_unique on public.friendships(least(requester_id,addressee_id),greatest(requester_id,addressee_id));

create or replace function public.make_memory_id()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'MC-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,4));
    exit when not exists(select 1 from public.profiles where memory_id=candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(user_id,memory_id,display_name)
  values(new.id,public.make_memory_id(),coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Игрок'))
  on conflict(user_id) do nothing;
  insert into public.user_settings(user_id,payload)
  values(new.id,'{}'::jsonb)
  on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.games enable row level security;
alter table public.collections enable row level security;
alter table public.collection_games enable row level security;
alter table public.friendships enable row level security;

create policy profiles_select_self on public.profiles for select using (auth.uid()=user_id);
create policy profiles_update_self on public.profiles for update using (auth.uid()=user_id) with check (auth.uid()=user_id);

create policy settings_all_self on public.user_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy games_all_self on public.games for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy collections_all_self on public.collections for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy collection_games_all_self on public.collection_games for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create policy friendships_select_participant on public.friendships for select using (auth.uid()=requester_id or auth.uid()=addressee_id);
create policy friendships_insert_requester on public.friendships for insert with check (auth.uid()=requester_id and status='pending');
create policy friendships_update_participant on public.friendships for update using (auth.uid()=requester_id or auth.uid()=addressee_id) with check (auth.uid()=requester_id or auth.uid()=addressee_id);
create policy friendships_delete_participant on public.friendships for delete using (auth.uid()=requester_id or auth.uid()=addressee_id);

create or replace function public.send_friend_request(target_memory_id text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target_id uuid;
  row_id uuid;
begin
  select user_id into target_id from public.profiles where upper(memory_id)=upper(trim(target_memory_id));
  if target_id is null then raise exception 'USER_NOT_FOUND'; end if;
  if target_id=auth.uid() then raise exception 'SELF_REQUEST'; end if;
  insert into public.friendships(requester_id,addressee_id,status)
  values(auth.uid(),target_id,'pending')
  on conflict(least(requester_id,addressee_id),greatest(requester_id,addressee_id)) do update set updated_at=now()
  returning id into row_id;
  return row_id;
end;
$$;

create or replace function public.accept_friend_request(friendship_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.friendships set status='accepted',updated_at=now()
  where id=friendship_id and addressee_id=auth.uid() and status='pending';
  return found;
end;
$$;

create or replace function public.get_friend_profile(target_memory_id text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  target_id uuid;
  allowed boolean;
  result jsonb;
begin
  select user_id into target_id from public.profiles where upper(memory_id)=upper(trim(target_memory_id));
  if target_id is null then return null; end if;
  select exists(
    select 1 from public.friendships
    where status='accepted'
      and ((requester_id=auth.uid() and addressee_id=target_id) or (addressee_id=auth.uid() and requester_id=target_id))
  ) into allowed;
  if not allowed then raise exception 'NOT_FRIENDS'; end if;
  select jsonb_build_object(
    'profile',jsonb_build_object('memoryId',p.memory_id,'displayName',p.display_name,'createdAt',p.created_at),
    'games',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'title',g.title,'platform',g.platform,'status',g.status,'releaseYear',g.release_year,
      'genre',g.genre,'franchise',g.franchise,'coverUrl',g.cover_url,'rating',g.rating,'replay',g.replay,
      'addedAt',g.added_at,'updatedAt',g.updated_at
    ) order by g.updated_at desc) from public.games g where g.user_id=target_id and g.deleted_at is null and g.status<>'backlog'),'[]'::jsonb)
  ) into result
  from public.profiles p where p.user_id=target_id;
  return result;
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.get_friend_profile(text) to authenticated;
