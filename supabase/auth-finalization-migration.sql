-- Launch authentication finalization.
-- 1. Suspended accounts cannot authenticate again after their sessions are revoked.
-- 2. A signed-in user can revoke every other device session.

create or replace function _check_pass(p_handle text, p_pass text)
returns boolean language plpgsql security definer as $$
declare
  a record;
  client_ip text := 'unknown';
begin
  if exists (
    select 1 from account_moderation
    where handle = lower(p_handle) and suspended
  ) then
    delete from sessions where handle = lower(p_handle);
    return false;
  end if;

  if p_pass ~ '^bst_[0-9a-f]{64}$' then
    update sessions set expires_at = now() + interval '30 days'
      where token_hash = encode(digest(p_pass, 'sha256'), 'hex')
        and handle = lower(p_handle)
        and expires_at > now();
    return found;
  end if;

  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then
    client_ip := 'unknown';
  end;

  select * into a from login_attempts
    where handle = lower(p_handle) and ip = client_ip;
  if a.locked_til is not null and a.locked_til > now() then
    raise exception 'locked';
  end if;
  if exists (
    select 1 from accounts where handle = lower(p_handle)
      and pass_hash = crypt(p_pass, pass_hash)
  ) then
    delete from login_attempts where handle = lower(p_handle) and ip = client_ip;
    return true;
  end if;
  if client_ip <> 'unknown' then
    insert into login_attempts(handle, ip, fail_count)
      values (lower(p_handle), client_ip, 1)
      on conflict (handle, ip) do update set
        fail_count = login_attempts.fail_count + 1,
        locked_til = case when login_attempts.fail_count + 1 >= 5
          then now() + interval '15 minutes' else null end;
  end if;
  return false;
end $$;

create or replace function revoke_other_sessions(p_handle text, p_pass text)
returns integer language plpgsql security definer as $$
declare removed integer := 0;
begin
  if not _check_pass(p_handle, p_pass) then raise exception 'auth'; end if;

  if p_pass ~ '^bst_[0-9a-f]{64}$' then
    delete from sessions
      where handle = lower(p_handle)
        and token_hash <> encode(digest(p_pass, 'sha256'), 'hex');
  else
    delete from sessions where handle = lower(p_handle);
  end if;
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function revoke_other_sessions(text,text) from public, authenticated;
grant execute on function revoke_other_sessions(text,text) to anon;

-- Enforce the suspension immediately for rows that already exist.
delete from sessions s using account_moderation m
  where s.handle = m.handle and m.suspended;
