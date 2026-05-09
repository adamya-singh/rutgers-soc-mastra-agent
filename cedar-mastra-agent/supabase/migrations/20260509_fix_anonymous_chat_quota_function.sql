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

revoke execute on function public.claim_anonymous_chat_message(uuid, int) from anon, authenticated;
