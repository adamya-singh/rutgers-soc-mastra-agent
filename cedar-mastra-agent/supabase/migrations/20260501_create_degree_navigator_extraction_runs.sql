create table if not exists public.degree_navigator_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  browser_session_id text not null,
  status text not null default 'created',
  payload jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  constraint degree_navigator_extraction_runs_status_check check (
    status in ('created', 'read', 'expired')
  )
);

create index if not exists degree_navigator_extraction_runs_user_created_idx
  on public.degree_navigator_extraction_runs (user_id, created_at desc);

create index if not exists degree_navigator_extraction_runs_browser_session_idx
  on public.degree_navigator_extraction_runs (browser_session_id);

create index if not exists degree_navigator_extraction_runs_expires_idx
  on public.degree_navigator_extraction_runs (expires_at);

alter table public.degree_navigator_extraction_runs enable row level security;

drop policy if exists "Degree Navigator extraction runs are backend only"
  on public.degree_navigator_extraction_runs;
create policy "Degree Navigator extraction runs are backend only"
  on public.degree_navigator_extraction_runs
  for all
  using (false)
  with check (false);

revoke all on table public.degree_navigator_extraction_runs from anon;
revoke all on table public.degree_navigator_extraction_runs from authenticated;
