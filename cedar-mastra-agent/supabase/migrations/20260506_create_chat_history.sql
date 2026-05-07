create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null default 'New chat',
  last_message_preview text,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  ui_message_id text not null,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  parts jsonb not null default '[]'::jsonb,
  ui_message jsonb not null,
  text_content text,
  sequence_index int not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint chat_messages_thread_sequence_unique unique (thread_id, sequence_index),
  constraint chat_messages_thread_ui_message_unique unique (thread_id, ui_message_id)
);

create index if not exists chat_threads_user_last_message_idx
  on public.chat_threads (user_id, last_message_at desc nulls last, updated_at desc)
  where deleted_at is null;

create index if not exists chat_messages_thread_sequence_idx
  on public.chat_messages (thread_id, sequence_index);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

drop trigger if exists set_chat_threads_updated_at on public.chat_threads;
create trigger set_chat_threads_updated_at
before update on public.chat_threads
for each row execute function public.set_updated_at();

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Chat threads are backend-only" on public.chat_threads;
create policy "Chat threads are backend-only"
  on public.chat_threads
  for all
  using (false)
  with check (false);

drop policy if exists "Chat messages are backend-only" on public.chat_messages;
create policy "Chat messages are backend-only"
  on public.chat_messages
  for all
  using (false)
  with check (false);

revoke all on table public.chat_threads from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;
