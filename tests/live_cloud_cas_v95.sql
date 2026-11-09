-- Memory Card v95: real production-schema RLS and server-CAS integration test.
-- Safe only as a whole script: BEGIN + ROLLBACK are mandatory. Uses test identities.
-- No emails, sessions, users, games or audit rows are retained.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
VALUES
('c9a0f195-1111-4111-8111-000000000095'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','mc-v95-a@example.invalid','',now(),now(),now(),'{"display_name":"V95 temporary A"}'),
('c9a0f195-2222-4222-8222-000000000095'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','mc-v95-b@example.invalid','',now(),now(),now(),'{"display_name":"V95 temporary B"}');
INSERT INTO public.games(user_id,id,title,platform,status,notes)
VALUES
('c9a0f195-1111-4111-8111-000000000095','v95-owned-a','Temporary game A','PS5','completed','PRIVATE_A'),
('c9a0f195-2222-4222-8222-000000000095','v95-owned-b','Temporary game B','3DS','completed','PRIVATE_B');
SET LOCAL ROLE authenticated;
DO $v95$
DECLARE
  a constant uuid := 'c9a0f195-1111-4111-8111-000000000095'::uuid;
  b constant uuid := 'c9a0f195-2222-4222-8222-000000000095'::uuid;
  initial_revision timestamptz;
  new_revision timestamptz;
  response jsonb;
  denied boolean;
  changed integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  IF (SELECT count(*) FROM public.profiles)<>1 OR
     (SELECT count(*) FROM public.user_settings)<>1 THEN
    RAISE EXCEPTION 'V95_A_SEES_PRIVATE_PROFILE_OR_SETTINGS';
  END IF;
  IF auth.uid() IS DISTINCT FROM a OR (SELECT count(*) FROM public.games)<>1 THEN
    RAISE EXCEPTION 'V95_A_CANNOT_ISOLATE_OWN_GAMES';
  END IF;
  UPDATE public.games SET notes='ILLICIT' WHERE user_id=b;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'V95_A_EDITED_B_GAME_WITH_DIRECT_UPDATE'; END IF;
  denied:=false;
  BEGIN
    INSERT INTO public.games(user_id,id,title,platform,status)
    VALUES(b,'v95-bad-insert','Cross-account injection','PS5','completed');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'V95_A_INSERTED_B_GAME_DIRECTLY'; END IF;

  SELECT updated_at INTO initial_revision
  FROM public.games WHERE user_id=a AND id='v95-owned-a';
  response:=public.save_games_if_unchanged(
    jsonb_build_array(jsonb_build_object('kind','update','revision',initial_revision,
      'game',jsonb_build_object('id','v95-owned-a','title','Temporary game A',
        'platform','PS5','status','completed','notes','Safe updated note'))));
  IF jsonb_array_length(response)<>1 THEN RAISE EXCEPTION 'V95_CAS_ACK_COUNT'; END IF;
  new_revision:=(response->0->>'updated_at')::timestamptz;
  IF new_revision<=initial_revision THEN RAISE EXCEPTION 'V95_CAS_REVISION_NOT_ADVANCED'; END IF;
  IF (SELECT notes FROM public.games WHERE user_id=a AND id='v95-owned-a')<>'Safe updated note' THEN
    RAISE EXCEPTION 'V95_CAS_UPDATE_NOT_SAVED';
  END IF;
  denied:=false;
  BEGIN
    PERFORM public.save_games_if_unchanged(
      jsonb_build_array(jsonb_build_object('kind','update','revision',initial_revision,
        'game',jsonb_build_object('id','v95-owned-a','title','Temporary game A',
          'platform','PS5','status','completed','notes','STALE OVERWRITE'))));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='MC_SYNC_CONFLICT' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'V95_STALE_CAS_UPDATE_WAS_ACCEPTED'; END IF;

  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  IF (SELECT count(*) FROM public.profiles)<>1 OR
     (SELECT count(*) FROM public.user_settings)<>1 THEN
    RAISE EXCEPTION 'V95_B_SEES_PRIVATE_PROFILE_OR_SETTINGS';
  END IF;
  IF auth.uid() IS DISTINCT FROM b OR (SELECT count(*) FROM public.games)<>1 THEN
    RAISE EXCEPTION 'V95_B_CANNOT_ISOLATE_OWN_GAMES';
  END IF;
  denied:=false;
  BEGIN
    -- B knows A's exact revision. Authorization must still reject the write.
    PERFORM public.save_games_if_unchanged(
      jsonb_build_array(jsonb_build_object('kind','update','revision',new_revision,
        'game',jsonb_build_object('id','v95-owned-a','title','Temporary game A',
          'platform','PS5','status','completed','notes','FORGED CROSS OWNER'))));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='MC_SYNC_CONFLICT' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'V95_FORGED_REVISION_EDITED_OTHER_OWNER'; END IF;
  response:=public.save_games_if_unchanged(
    jsonb_build_array(jsonb_build_object('kind','insert','revision',null,
      'game',jsonb_build_object('id','v95-owned-a','title','Separate B game with same ID',
        'platform','3DS','status','playing','notes','Independent owner',
        'user_id',a::text))));
  IF jsonb_array_length(response)<>1
     OR (SELECT user_id FROM public.games WHERE id='v95-owned-a') IS DISTINCT FROM b THEN
    RAISE EXCEPTION 'V95_CAS_DID_NOT_FORCE_AUTH_OWNER';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  IF (SELECT notes FROM public.games WHERE user_id=a AND id='v95-owned-a')<>'Safe updated note' THEN
    RAISE EXCEPTION 'V95_FORGED_CAS_MODIFIED_A_GAME';
  END IF;
  RAISE NOTICE 'V95_CLOUD_CAS_ASSERTIONS_PASSED';
END;
$v95$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM auth.users) AS remaining_users,
 (SELECT count(*) FROM public.games) AS remaining_games,
 (SELECT count(*) FROM auth.users WHERE email LIKE 'mc-v95-%@example.invalid') AS remaining_fixture_users;