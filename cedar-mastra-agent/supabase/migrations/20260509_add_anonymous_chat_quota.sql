create table if not exists public.anonymous_chat_clients (
  id uuid primary key default gen_random_uuid(),
  token_version int not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.anonymous_chat_daily_usage (
  client_id uuid not null references public.anonymous_chat_clients on delete cascade,
  usage_date date not null,
  message_count int not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint anonymous_chat_daily_usage_pkey primary key (client_id, usage_date)
);

drop trigger if exists set_anonymous_chat_daily_usage_updated_at on public.anonymous_chat_daily_usage;
create trigger set_anonymous_chat_daily_usage_updated_at
before update on public.anonymous_chat_daily_usage
for each row execute function public.set_updated_at();

alter table public.chat_threads
  add column if not exists anonymous_client_id uuid references public.anonymous_chat_clients on delete cascade;

alter table public.chat_messages
  add column if not exists anonymous_client_id uuid references public.anonymous_chat_clients on delete cascade;

alter table public.chat_threads
  alter column user_id drop not null;

alter table public.chat_messages
  alter column user_id drop not null;

alter table public.chat_threads
  drop constraint if exists chat_threads_exactly_one_owner;

alter table public.chat_threads
  add constraint chat_threads_exactly_one_owner
  check (
    (case when user_id is not null then 1 else 0 end) +
    (case when anonymous_client_id is not null then 1 else 0 end) = 1
  );

alter table public.chat_messages
  drop constraint if exists chat_messages_exactly_one_owner;

alter table public.chat_messages
  add constraint chat_messages_exactly_one_owner
  check (
    (case when user_id is not null then 1 else 0 end) +
    (case when anonymous_client_id is not null then 1 else 0 end) = 1
  );

create unique index if not exists chat_threads_anonymous_single_active_idx
  on public.chat_threads (anonymous_client_id)
  where deleted_at is null and anonymous_client_id is not null;

create index if not exists chat_threads_anonymous_last_message_idx
  on public.chat_threads (anonymous_client_id, last_message_at desc nulls last, updated_at desc)
  where deleted_at is null and anonymous_client_id is not null;

create index if not exists chat_messages_anonymous_created_idx
  on public.chat_messages (anonymous_client_id, created_at desc)
  where anonymous_client_id is not null;

create or replace function public.claim_anonymous_chat_message(
  p_client_id uuid,
  p_daily_limit int
)
returns table (
  allowed boolean,
  message_count int,
  daily_limit int,
  remaining int,
  usage_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_date date := timezone('utc', now())::date;
  v_message_count int;
begin
  if p_daily_limit < 1 then
    raise exception 'Anonymous chat daily limit must be at least 1';
  end if;

  insert into public.anonymous_chat_clients (id, last_seen_at)
  values (p_client_id, now())
  on conflict (id) do update
    set last_seen_at = excluded.last_seen_at
    where public.anonymous_chat_clients.revoked_at is null;

  if not exists (
    select 1
    from public.anonymous_chat_clients
    where id = p_client_id
      and revoked_at is null
  ) then
    return query select false, p_daily_limit, p_daily_limit, 0, v_usage_date;
    return;
  end if;

  insert into public.anonymous_chat_daily_usage (client_id, usage_date, message_count)
  values (p_client_id, v_usage_date, 0)
  on conflict on constraint anonymous_chat_daily_usage_pkey do nothing;

  update public.anonymous_chat_daily_usage
  set message_count = anonymous_chat_daily_usage.message_count + 1
  where anonymous_chat_daily_usage.client_id = p_client_id
    and anonymous_chat_daily_usage.usage_date = v_usage_date
    and anonymous_chat_daily_usage.message_count < p_daily_limit
  returning anonymous_chat_daily_usage.message_count into v_message_count;

  if found then
    return query select true, v_message_count, p_daily_limit, greatest(p_daily_limit - v_message_count, 0), v_usage_date;
    return;
  end if;

  select anonymous_chat_daily_usage.message_count
  into v_message_count
  from public.anonymous_chat_daily_usage
  where anonymous_chat_daily_usage.client_id = p_client_id
    and anonymous_chat_daily_usage.usage_date = v_usage_date;

  return query select false, coalesce(v_message_count, p_daily_limit), p_daily_limit, 0, v_usage_date;
end;
$$;

alter table public.anonymous_chat_clients enable row level security;
alter table public.anonymous_chat_daily_usage enable row level security;

drop policy if exists "Anonymous chat clients are backend-only" on public.anonymous_chat_clients;
create policy "Anonymous chat clients are backend-only"
  on public.anonymous_chat_clients
  for all
  using (false)
  with check (false);

drop policy if exists "Anonymous chat usage is backend-only" on public.anonymous_chat_daily_usage;
create policy "Anonymous chat usage is backend-only"
  on public.anonymous_chat_daily_usage
  for all
  using (false)
  with check (false);

revoke all on table public.anonymous_chat_clients from anon, authenticated;
revoke all on table public.anonymous_chat_daily_usage from anon, authenticated;
revoke execute on function public.claim_anonymous_chat_message(uuid, int) from anon, authenticated;
