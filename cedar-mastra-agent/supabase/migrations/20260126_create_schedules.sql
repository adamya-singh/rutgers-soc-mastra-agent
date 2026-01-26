create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  snapshot jsonb not null,
  term_year int,
  term_code text,
  campus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedules_user_id_idx on public.schedules (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_schedules_updated_at on public.schedules;
create trigger set_schedules_updated_at
before update on public.schedules
for each row execute function public.set_updated_at();

alter table public.schedules enable row level security;

drop policy if exists "Schedules are user-owned" on public.schedules;
create policy "Schedules are user-owned"
  on public.schedules
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
