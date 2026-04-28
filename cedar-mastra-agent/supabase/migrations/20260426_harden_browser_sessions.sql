alter table public.browser_sessions
  add column if not exists user_id uuid references auth.users on delete cascade;

update public.browser_sessions
set user_id = owner_id::uuid
where user_id is null
  and owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

create index if not exists browser_sessions_user_heartbeat_idx
  on public.browser_sessions (user_id, last_heartbeat_at desc)
  where user_id is not null;

comment on column public.browser_sessions.owner_id is
  'Legacy client-provided identifier. Do not use for authorization.';

comment on column public.browser_sessions.user_id is
  'Authenticated Supabase user that owns this browser session.';

alter table public.browser_sessions enable row level security;

drop policy if exists "Browser sessions are backend only" on public.browser_sessions;
create policy "Browser sessions are backend only"
  on public.browser_sessions
  for all
  using (false)
  with check (false);

revoke all on table public.browser_sessions from anon;
revoke all on table public.browser_sessions from authenticated;
