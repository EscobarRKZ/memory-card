-- Memory Card v82: exact deployed version, generated from pg_get_functiondef.
-- Applied to Supabase project as migration 20261107105332.
-- Phase A is additive: existing games table grants remain until verified rollout.

CREATE OR REPLACE FUNCTION public.save_games_if_unchanged(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_change jsonb;
  v_game jsonb;
  v_kind text;
  v_id text;
  v_title text;
  v_platform text;
  v_status text;
  v_revision timestamptz;
  v_time timestamptz;
  v_saved timestamptz;
  v_added timestamptz;
  v_deleted timestamptz;
  v_rating smallint;
  v_replay integer;
  v_seen text[] := array[]::text[];
  v_ack jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'MC_NOT_AUTHENTICATED' using errcode='42501';
  end if;

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_array_length(p_changes) > 100
     or octet_length(p_changes::text) > 2000000 then
    raise exception 'MC_INVALID_BATCH' using errcode='22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_game := v_change->'game';
    v_kind := v_change->>'kind';
    if jsonb_typeof(v_change) is distinct from 'object'
       or jsonb_typeof(v_game) is distinct from 'object'
       or v_kind not in ('insert','update') then
      raise exception 'MC_INVALID_CHANGE' using errcode='22023';
    end if;

    v_id := btrim(coalesce(v_game->>'id',''));
    v_title := btrim(coalesce(v_game->>'title',''));
    v_platform := btrim(coalesce(v_game->>'platform',''));
    v_status := btrim(coalesce(v_game->>'status',''));
    if v_id='' or char_length(v_id)>200 or v_title='' or char_length(v_title)>1000
       or v_platform='' or char_length(v_platform)>120
       or v_status not in ('completed','playing','dropped','backlog')
       or v_id=any(v_seen) then
      raise exception 'MC_INVALID_GAME' using errcode='22023';
    end if;
    v_seen := array_append(v_seen,v_id);

    if char_length(coalesce(v_game->>'notes',''))>50000
       or char_length(coalesce(v_game->>'cover_url',''))>8000 then
      raise exception 'MC_INVALID_GAME_FIELDS' using errcode='22023';
    end if;

    v_revision := nullif(v_change->>'revision','')::timestamptz;
    v_rating := nullif(v_game->>'rating','')::smallint;
    v_replay := coalesce(nullif(v_game->>'replay','')::integer,0);
    v_added := coalesce(nullif(v_game->>'added_at','')::timestamptz,clock_timestamp());
    v_deleted := nullif(v_game->>'deleted_at','')::timestamptz;
    v_saved := null;

    if v_kind='insert' then
      if v_revision is not null then
        raise exception 'MC_INVALID_INSERT_REVISION' using errcode='22023';
      end if;
      v_time := clock_timestamp();
      insert into public.games (
        user_id,id,title,platform,status,release_year,genre,franchise,
        cover_url,cover_source,rating,replay,notes,added_at,updated_at,deleted_at
      ) values (
        v_uid,v_id,v_title,v_platform,v_status,
        coalesce(v_game->>'release_year',''),
        coalesce(v_game->>'genre',''),
        coalesce(v_game->>'franchise',''),
        coalesce(v_game->>'cover_url',''),
        coalesce(v_game->>'cover_source',''),
        v_rating,v_replay,
        coalesce(v_game->>'notes',''),v_added,v_time,v_deleted
      )
      on conflict (user_id,id) do nothing
      returning updated_at into v_saved;
    else
      if v_revision is null then
        raise exception 'MC_EXPECTED_REVISION_REQUIRED' using errcode='22023';
      end if;
      v_time := greatest(clock_timestamp(),v_revision + interval '1 microsecond');
      update public.games set
        title=v_title,platform=v_platform,status=v_status,
        release_year=coalesce(v_game->>'release_year',''),
        genre=coalesce(v_game->>'genre',''),
        franchise=coalesce(v_game->>'franchise',''),
        cover_url=coalesce(v_game->>'cover_url',''),
        cover_source=coalesce(v_game->>'cover_source',''),
        rating=v_rating,replay=v_replay,
        notes=coalesce(v_game->>'notes',''),
        added_at=v_added,updated_at=v_time,deleted_at=v_deleted
      where user_id=v_uid and id=v_id and updated_at=v_revision
      returning updated_at into v_saved;
    end if;

    if v_saved is null then
      raise exception 'MC_SYNC_CONFLICT' using errcode='P0001';
    end if;
    v_ack := v_ack || jsonb_build_array(jsonb_build_object(
      'id',v_id,'updated_at',v_saved
    ));
  end loop;
  return v_ack;
end;
$function$;

revoke all on function public.save_games_if_unchanged(jsonb) from public, anon, authenticated;
grant execute on function public.save_games_if_unchanged(jsonb) to authenticated;
notify pgrst, 'reload schema';
