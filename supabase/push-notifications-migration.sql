-- Web Push subscriptions are private, device-scoped records.
-- All browser access goes through token-validated RPCs; delivery uses service_role.

grant execute on function verify_app_session(text,text) to service_role;

create table if not exists push_subscriptions (
  endpoint text primary key,
  handle text not null references accounts(handle) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_handle_idx on push_subscriptions(handle);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from public, anon, authenticated;

create table if not exists push_delivery_state (
  target text primary key references accounts(handle) on delete cascade,
  last_sent_at timestamptz not null default '-infinity'
);
alter table push_delivery_state enable row level security;
revoke all on push_delivery_state from public, anon, authenticated;

create or replace function save_push_subscription(
  p_handle text,
  p_secret text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _check_pass(p_handle, p_secret) then raise exception 'auth'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 2500
     or length(coalesce(p_p256dh, '')) not between 20 and 512
     or length(coalesce(p_auth, '')) not between 8 and 256
     or length(coalesce(p_user_agent, '')) > 300 then
    raise exception 'invalid push subscription';
  end if;
  insert into push_subscriptions(endpoint, handle, p256dh, auth, user_agent, updated_at)
    values (p_endpoint, lower(p_handle), p_p256dh, p_auth, coalesce(p_user_agent, ''), now())
    on conflict (endpoint) do update set
      handle = excluded.handle,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      updated_at = now();
end $$;
revoke all on function save_push_subscription(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function save_push_subscription(text,text,text,text,text,text) to anon;

create or replace function delete_push_subscription(
  p_handle text,
  p_secret text,
  p_endpoint text
)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _check_pass(p_handle, p_secret) then raise exception 'auth'; end if;
  delete from push_subscriptions
    where endpoint = p_endpoint and handle = lower(p_handle);
end $$;
revoke all on function delete_push_subscription(text,text,text) from public, anon, authenticated;
grant execute on function delete_push_subscription(text,text,text) to anon;

create or replace function claim_push_delivery(p_target text)
returns boolean language sql security definer set search_path = public as $$
  with claimed as (
    insert into push_delivery_state(target, last_sent_at)
      values (lower(p_target), now())
    on conflict (target) do update set last_sent_at = excluded.last_sent_at
      where push_delivery_state.last_sent_at < now() - interval '30 seconds'
    returning 1
  )
  select exists(select 1 from claimed);
$$;
revoke all on function claim_push_delivery(text) from public, anon, authenticated;
grant execute on function claim_push_delivery(text) to service_role;

create or replace function get_push_targets(p_target text)
returns table(endpoint text, p256dh text, auth text)
language sql security definer stable set search_path = public as $$
  select distinct ps.endpoint, ps.p256dh, ps.auth
    from follows_server fs
    join push_subscriptions ps on ps.handle = fs.handle
   where fs.target = lower(p_target)
   limit 5000;
$$;
revoke all on function get_push_targets(text) from public, anon, authenticated;
grant execute on function get_push_targets(text) to service_role;
