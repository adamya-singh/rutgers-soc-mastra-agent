create table if not exists public.browser_sessions (
  session_id text primary key,
  owner_id text not null,
  provider text not null,
  target text not null,
  live_view_url text not null,
  status text not null,
  created_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  closing_started_at timestamptz,
  close_reason text,
  termination_method text,
  termination_verified boolean,
  provider_still_running boolean,
  updated_at timestamptz not null default now(),
  constraint browser_sessions_status_check check (
    status in ('created', 'awaiting_login', 'ready', 'error', 'closed')
  )
);

create index if not exists browser_sessions_owner_heartbeat_idx
  on public.browser_sessions (owner_id, last_heartbeat_at desc);

create index if not exists browser_sessions_status_heartbeat_idx
  on public.browser_sessions (status, last_heartbeat_at);

create index if not exists browser_sessions_closing_started_idx
  on public.browser_sessions (closing_started_at);

drop trigger if exists set_browser_sessions_updated_at on public.browser_sessions;
create trigger set_browser_sessions_updated_at
before update on public.browser_sessions
for each row execute function public.set_updated_at();
