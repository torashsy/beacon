-- ログイン妨害対策 + 新規パスコード要件（既存パスコードでのログインは維持）。
create table if not exists login_attempts (
  handle text not null,
  ip text not null,
  fail_count int default 0,
  locked_til timestamptz,
  primary key (handle, ip)
);
alter table login_attempts enable row level security;
revoke all on login_attempts from anon, authenticated;

create or replace function _check_pass(p_handle text, p_pass text)
returns boolean language plpgsql security definer as $$
declare
  a record;
  client_ip text := 'unknown';
begin
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
    where handle=lower(p_handle) and ip=client_ip;
  if a.locked_til is not null and a.locked_til > now() then
    raise exception 'locked';
  end if;
  if exists(select 1 from accounts where handle=lower(p_handle)
            and pass_hash = crypt(p_pass, pass_hash)) then
    delete from login_attempts where handle=lower(p_handle) and ip=client_ip;
    return true;
  end if;
  if client_ip <> 'unknown' then
    insert into login_attempts(handle,ip,fail_count) values (lower(p_handle),client_ip,1)
      on conflict (handle,ip) do update set
        fail_count = login_attempts.fail_count + 1,
        locked_til = case when login_attempts.fail_count + 1 >= 5
                          then now() + interval '15 minutes' else null end;
  end if;
  return false;
end $$;

create or replace function create_account(p_handle text, p_pass text)
returns text language plpgsql security definer as $$
declare
  rc text;
  client_ip text := 'unknown';
  attempts int;
begin
  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then client_ip := 'unknown';
  end;
  insert into signup_attempts(ip, n) values (client_ip, 1)
    on conflict (ip, day) do update set n = signup_attempts.n + 1
    returning n into attempts;
  if attempts > 20 then raise exception 'too many accounts created from this network today'; end if;
  if length(p_pass) < 10 then raise exception 'pass too short'; end if;
  if octet_length(p_pass) > 72 then raise exception 'pass too long'; end if;
  if lower(p_handle) !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid handle'; end if;
  if lower(p_handle) = any(array[
    'admin','administrator','official','beacon','support','help','staff',
    'moderator','mod','root','api','system','null','undefined','terms',
    'privacy','robots','test','www','mail'
  ]) then raise exception 'taken'; end if;
  if exists(select 1 from accounts where handle=lower(p_handle)) then raise exception 'taken'; end if;
  rc := upper(encode(gen_random_bytes(6),'hex'));
  insert into accounts(handle,pass_hash,rc_hash)
    values (lower(p_handle), crypt(p_pass, gen_salt('bf')), crypt(rc, gen_salt('bf')));
  insert into profiles(handle) values (lower(p_handle));
  return rc;
end $$;

create or replace function reset_pass(p_handle text, p_rc text, p_new text)
returns boolean language plpgsql security definer as $$
declare a record;
begin
  if length(p_new) < 10 then raise exception 'pass too short'; end if;
  if octet_length(p_new) > 72 then raise exception 'pass too long'; end if;
  select * into a from auth_attempts where handle=lower(p_handle);
  if a.rc_locked_til is not null and a.rc_locked_til > now() then raise exception 'locked'; end if;
  if not exists(select 1 from accounts where handle=lower(p_handle)
                and rc_hash = crypt(upper(p_rc), rc_hash)) then
    insert into auth_attempts(handle, rc_fail_count) values (lower(p_handle), 1)
      on conflict (handle) do update set
        rc_fail_count = auth_attempts.rc_fail_count + 1,
        rc_locked_til = case when auth_attempts.rc_fail_count + 1 >= 5
                             then now() + interval '15 minutes'
                             else auth_attempts.rc_locked_til end;
    return false;
  end if;
  update auth_attempts set rc_fail_count = 0, rc_locked_til = null
    where handle=lower(p_handle);
  update accounts set pass_hash = crypt(p_new, gen_salt('bf')), updated_at=now()
    where handle=lower(p_handle);
  delete from sessions where handle=lower(p_handle);
  return true;
end $$;

-- 旧ハンドル単位ログインロックを解除。復旧コード用カウンタは維持する。
update auth_attempts set fail_count = 0, locked_til = null;
