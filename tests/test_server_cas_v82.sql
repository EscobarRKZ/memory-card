-- Memory Card v82 server RPC smoke test.
-- Run manually against a development/test project or inside a controlled SQL
-- session. It needs one existing authenticated profile as an ownership fixture.
-- Every probe row is rolled back by the deliberate inner exception.
-- No persistent game records are created or modified.

do $probe$
declare
  v_uid uuid;
  v_insert jsonb;
  v_updated jsonb;
  v_ok boolean := false;
  v_rejected boolean := false;
  v_id constant text := '__mc_v82_transaction_test__';
begin
  if not has_function_privilege('authenticated','public.save_games_if_unchanged(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_games_if_unchanged(jsonb)','EXECUTE') then
    raise exception 'Unsafe RPC privileges';
  end if;

  select user_id into v_uid from public.profiles order by user_id limit 1;
  if v_uid is null then raise notice 'No existing profile; skip transactional game write test'; return; end if;
  if exists(select 1 from public.games where user_id=v_uid and id=v_id) then
    raise exception 'Test ID already exists';
  end if;

  begin
    perform set_config('request.jwt.claim.sub',v_uid::text,true);
    v_insert:=public.save_games_if_unchanged(jsonb_build_array(
      jsonb_build_object('kind','insert','game',jsonb_build_object(
        'user_id','00000000-0000-0000-0000-000000000000',
        'id',v_id,'title','RPC test','platform','PS5',
        'status','completed','notes','first'))
    ));
    if jsonb_array_length(v_insert)<>1 or (v_insert->0->>'id')<>v_id then
      raise exception 'Insert was not acknowledged';
    end if;
    if not exists(select 1 from public.games where user_id=v_uid and id=v_id and notes='first') then
      raise exception 'Caller ownership check failed';
    end if;

    v_updated:=public.save_games_if_unchanged(jsonb_build_array(
      jsonb_build_object('kind','update','revision',v_insert->0->>'updated_at',
        'game',jsonb_build_object('id',v_id,'title','RPC test',
          'platform','PS5','status','completed','notes','second'))
    ));
    if v_updated->0->>'updated_at'=v_insert->0->>'updated_at' then
      raise exception 'Server revision did not advance';
    end if;

    begin
      perform public.save_games_if_unchanged(jsonb_build_array(
        jsonb_build_object('kind','update','revision',v_insert->0->>'updated_at',
          'game',jsonb_build_object('id',v_id,'title','RPC test',
            'platform','PS5','status','completed','notes','stale'))
      ));
    exception when others then
      if sqlerrm <> 'MC_SYNC_CONFLICT' then raise; end if;
      v_rejected:=true;
    end;
    if not v_rejected then raise exception 'Stale update was accepted'; end if;
    if not exists(select 1 from public.games where user_id=v_uid and id=v_id and notes='second') then
      raise exception 'Rejected write changed game data';
    end if;

    v_ok:=true;
    raise exception '__ROLLBACK_V82_PROBE__';
  exception when others then
    if sqlerrm <> '__ROLLBACK_V82_PROBE__' then raise; end if;
  end;

  if not v_ok then raise exception 'Server probe failed'; end if;
  if exists(select 1 from public.games where user_id=v_uid and id=v_id) then
    raise exception 'Server probe left a persistent row';
  end if;
  raise notice 'v82 RPC test passed and all probe changes rolled back';
end
$probe$;
