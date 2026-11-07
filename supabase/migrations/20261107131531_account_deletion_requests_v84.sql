-- Memory Card v84: non-destructive account deletion request intake.
-- Never deletes users or any existing user data.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','needs_verification')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from PUBLIC, anon, authenticated;
grant select, insert on public.account_deletion_requests to authenticated;
grant select, insert, update, delete on public.account_deletion_requests to service_role;

create policy "deletion_request_read_own"
on public.account_deletion_requests for select to authenticated
using ((select auth.uid()) = user_id);

create policy "deletion_request_insert_own"
on public.account_deletion_requests for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and status='pending'
  and reviewed_at is null
);

comment on table public.account_deletion_requests is
  'Authenticated requests for manual account and associated data deletion. Inserting never deletes data.';
