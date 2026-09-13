drop policy if exists friendships_update_participant on public.friendships;
revoke update on public.friendships from authenticated;
revoke update on public.friendships from anon;
grant select, insert, delete on public.friendships to authenticated;
