create table if not exists public.degree_navigator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  schema_version int not null default 1,

  student_name text,
  ruid text,
  netid text,
  school_code text,
  school_name text,
  graduation_year text,
  graduation_month text,
  degree_credits_earned numeric,
  cumulative_gpa numeric,
  planned_course_count int,

  profile jsonb not null,
  programs jsonb not null default '[]'::jsonb,
  audits jsonb not null default '[]'::jsonb,
  transcript_terms jsonb not null default '[]'::jsonb,
  run_notes jsonb not null default '{}'::jsonb,

  source text not null default 'degree_navigator',
  source_session_id text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint degree_navigator_profiles_user_unique unique (user_id)
);

create index if not exists degree_navigator_profiles_user_captured_idx
  on public.degree_navigator_profiles (user_id, captured_at desc);

drop trigger if exists set_degree_navigator_profiles_updated_at on public.degree_navigator_profiles;
create trigger set_degree_navigator_profiles_updated_at
before update on public.degree_navigator_profiles
for each row execute function public.set_updated_at();

alter table public.degree_navigator_profiles enable row level security;

drop policy if exists "Degree Navigator profiles are user-owned" on public.degree_navigator_profiles;
create policy "Degree Navigator profiles are user-owned"
  on public.degree_navigator_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
