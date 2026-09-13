revoke all on function public.make_memory_id() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.accept_friend_request(uuid) from public, anon;
revoke all on function public.get_friend_profile(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.get_friend_profile(text) to authenticated;
