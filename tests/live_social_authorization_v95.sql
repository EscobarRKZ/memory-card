-- Memory Card v95: real production-schema social authorization test.
-- Fixtures exist only between BEGIN and ROLLBACK. No persistent account writes.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
VALUES
('c9a0f195-1111-4111-8111-000000000095'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','mc-v95-a@example.invalid','',now(),now(),now(),'{"display_name":"V95 temporary A"}'),
('c9a0f195-2222-4222-8222-000000000095'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','mc-v95-b@example.invalid','',now(),now(),now(),'{"display_name":"V95 temporary B"}');
UPDATE public.profiles SET memory_id='MC-V95A-TEST'
 WHERE user_id='c9a0f195-1111-4111-8111-000000000095';
UPDATE public.profiles SET memory_id='MC-V95B-TEST'
 WHERE user_id='c9a0f195-2222-4222-8222-000000000095';
INSERT INTO public.games(user_id,id,title,platform,status,notes)
VALUES
('c9a0f195-2222-4222-8222-000000000095','v95-friend-b','Shared game B','3DS','completed','PRIVATE_NOTE_B'),
('c9a0f195-2222-4222-8222-000000000095','v95-backlog-b','Hidden backlog B','3DS','backlog','PRIVATE_BACKLOG_B');
SET LOCAL ROLE authenticated;
DO $v95$
DECLARE
 a constant uuid := 'c9a0f195-1111-4111-8111-000000000095'::uuid;
 b constant uuid := 'c9a0f195-2222-4222-8222-000000000095'::uuid;
 inv uuid;
 reinv uuid;
 card jsonb;
 social jsonb;
 denied boolean;
BEGIN
 IF has_function_privilege('anon','public.accept_friend_request(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.get_friend_profile(text)','EXECUTE')
    OR has_function_privilege('anon','public.social_state()','EXECUTE') THEN
   RAISE EXCEPTION 'V95_ANONYMOUS_SOCIAL_RPC_EXPOSED';
 END IF;
 IF has_table_privilege('authenticated','public.friendships','INSERT')
    OR has_table_privilege('authenticated','public.friendships','UPDATE')
    OR has_table_privilege('authenticated','public.friendships','DELETE') THEN
   RAISE EXCEPTION 'V95_DIRECT_FRIENDSHIP_MUTATION_EXPOSED';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 denied:=false;
 BEGIN PERFORM public.get_friend_profile('MC-V95B-TEST');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='NOT_FRIENDS' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'V95_NONFRIEND_PROFILE_VISIBLE'; END IF;
 inv:=public.send_friend_request('MC-V95B-TEST');
 IF inv IS NULL OR public.accept_friend_request(inv) THEN
   RAISE EXCEPTION 'V95_REQUESTER_ACCEPTED_OWN_INVITE';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 social:=public.social_state();
 IF jsonb_array_length(social->'incoming')<>1 THEN
   RAISE EXCEPTION 'V95_MISSING_INCOMING_INVITATION';
 END IF;
 IF NOT public.accept_friend_request(inv) OR public.accept_friend_request(inv) THEN
   RAISE EXCEPTION 'V95_ADDRESSEE_ACCEPTANCE_FAILED';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 social:=public.social_state();
 IF jsonb_array_length(social->'friends')<>1 THEN
   RAISE EXCEPTION 'V95_ACCEPTED_FRIEND_MISSING';
 END IF;
 card:=public.get_friend_profile('MC-V95B-TEST');
 IF card::text NOT LIKE '%Shared game B%'
    OR card::text LIKE '%PRIVATE_NOTE_B%'
    OR card::text LIKE '%Hidden backlog B%'
    OR card::text LIKE '%PRIVATE_BACKLOG_B%' THEN
   RAISE EXCEPTION 'V95_SOCIAL_PROFILE_DATA_LEAK';
 END IF;

 IF NOT public.block_user('MC-V95B-TEST') THEN
   RAISE EXCEPTION 'V95_BLOCK_FAILED';
 END IF;
 social:=public.social_state();
 IF jsonb_array_length(social->'friends')<>0
    OR jsonb_array_length(social->'incoming')<>0
    OR jsonb_array_length(social->'outgoing')<>0 THEN
   RAISE EXCEPTION 'V95_BLOCKED_FRIEND_STILL_VISIBLE';
 END IF;
 denied:=false;
 BEGIN PERFORM public.get_friend_profile('MC-V95B-TEST');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='NOT_FRIENDS' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied OR public.accept_friend_request(inv) THEN
   RAISE EXCEPTION 'V95_BLOCKED_PROFILE_OR_OLD_INVITE_ACCESSIBLE';
 END IF;

 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;
 BEGIN PERFORM public.send_friend_request('MC-V95A-TEST');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FRIEND_UNAVAILABLE' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'V95_BLOCK_REVERSED_BYPASSED'; END IF;

 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF NOT public.unblock_user('MC-V95B-TEST') THEN
   RAISE EXCEPTION 'V95_UNBLOCK_FAILED';
 END IF;
 IF jsonb_array_length(public.social_state()->'friends')<>0 THEN
   RAISE EXCEPTION 'V95_UNBLOCK_AUTO_RESTORED_FRIENDSHIP';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 reinv:=public.send_friend_request('MC-V95A-TEST');
 IF reinv IS NULL OR reinv=inv THEN
   RAISE EXCEPTION 'V95_REINVITE_DID_NOT_CREATE_NEW_REQUEST';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 IF NOT public.accept_friend_request(reinv)
    OR jsonb_array_length(public.social_state()->'friends')<>1 THEN
   RAISE EXCEPTION 'V95_REINVITATION_NOT_ACCEPTED';
 END IF;
 RAISE NOTICE 'V95_SOCIAL_AUTHORIZATION_ASSERTIONS_PASSED';
END;
$v95$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM auth.users) AS remaining_users,
 (SELECT count(*) FROM public.games) AS remaining_games,
 (SELECT count(*) FROM public.friendships) AS remaining_friendships,
 (SELECT count(*) FROM mc_private.user_blocks) AS remaining_blocks,
 (SELECT count(*) FROM mc_private.friend_request_events) AS remaining_request_audit_rows,
 (SELECT count(*) FROM auth.users WHERE email LIKE 'mc-v95-%@example.invalid') AS remaining_fixture_users;