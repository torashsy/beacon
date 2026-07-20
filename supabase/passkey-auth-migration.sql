-- Passwordless sign-up and sign-in bridge.
-- Supabase Auth verifies passkeys; the existing app RPCs continue to use revocable
-- bst_ session tokens so the public data model does not need a risky rewrite.

alter table accounts add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table accounts add column if not exists recovery_verified boolean not null default false;
alter table accounts add column if not exists recovery_kind text
  check (recovery_kind is null or recovery_kind in ('email', 'phone', 'email+phone'));
create unique index if not exists accounts_auth_user_id_uidx
  on accounts(auth_user_id) where auth_user_id is not null;

create or replace function _issue_app_session(p_handle text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  delete from sessions where expires_at < now();
  tok := 'bst_' || encode(gen_random_bytes(32), 'hex');
  insert into sessions(token_hash, handle, expires_at)
    values (encode(digest(tok, 'sha256'), 'hex'), lower(p_handle), now() + interval '30 days');
  delete from sessions
    where handle = lower(p_handle)
      and token_hash not in (
        select token_hash from sessions where handle = lower(p_handle)
        order by created_at desc limit 10
      );
  return tok;
end $$;
revoke all on function _issue_app_session(text) from public, anon, authenticated;

-- Edge Function only: rate-limit bootstrap users and allow a current legacy user
-- to claim the same handle while migrating to a passkey.
create or replace function authorize_passkey_signup(
  p_handle text,
  p_ip text,
  p_legacy_secret text default null
)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare attempts int;
declare normalized text := lower(coalesce(p_handle, ''));
declare network text := left(coalesce(nullif(trim(p_ip), ''), 'unknown'), 100);
begin
  if normalized !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid handle'; end if;
  if normalized = any(array[
    'admin','administrator','official','beacon','support','help','staff',
    'moderator','mod','root','api','system','null','undefined','terms',
    'privacy','robots','test','www','mail'
  ]) then raise exception 'taken'; end if;

  insert into signup_attempts(ip, n) values (network, 1)
    on conflict (ip, day) do update set n = signup_attempts.n + 1
    returning n into attempts;
  if attempts > 20 then raise exception 'too many accounts created from this network today'; end if;

  if exists(select 1 from accounts where handle = normalized) then
    if coalesce(p_legacy_secret, '') = '' or not _check_pass(normalized, p_legacy_secret) then
      raise exception 'taken';
    end if;
    if exists(select 1 from accounts where handle = normalized and auth_user_id is not null) then
      raise exception 'passkey already linked';
    end if;
    return 'legacy';
  end if;
  return 'new';
end $$;
revoke all on function authorize_passkey_signup(text,text,text) from public, anon, authenticated;
grant execute on function authorize_passkey_signup(text,text,text) to service_role;

create or replace function finalize_passkey_account(
  p_handle text,
  p_legacy_secret text default null
)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := auth.uid();
declare expected text;
declare normalized text := lower(coalesce(p_handle, ''));
declare linked uuid;
declare tok text;
begin
  if uid is null then raise exception 'auth'; end if;
  select lower(coalesce(raw_user_meta_data->>'requested_handle', ''))
    into expected from auth.users where id = uid and confirmed_at is not null;
  if expected is null or expected <> normalized then raise exception 'auth'; end if;

  select auth_user_id into linked from accounts where handle = normalized for update;
  if found then
    if linked = uid then null;
    elsif linked is null and coalesce(p_legacy_secret, '') <> ''
      and _check_pass(normalized, p_legacy_secret) then
      update accounts set auth_user_id = uid, updated_at = now() where handle = normalized;
    else
      raise exception 'taken';
    end if;
  else
    insert into accounts(handle, pass_hash, rc_hash, auth_user_id)
      values (
        normalized,
        crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
        crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
        uid
      );
    insert into profiles(handle) values (normalized);
  end if;

  tok := _issue_app_session(normalized);
  return jsonb_build_object('handle', normalized, 'token', tok);
end $$;
revoke all on function finalize_passkey_account(text,text) from public, anon;
grant execute on function finalize_passkey_account(text,text) to authenticated;

create or replace function create_passkey_session()
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := auth.uid();
declare h text;
declare tok text;
begin
  if uid is null then raise exception 'auth'; end if;
  select handle into h from accounts where auth_user_id = uid;
  if h is null then raise exception 'account not ready'; end if;
  if exists(select 1 from account_moderation where handle = h and suspended) then
    delete from sessions where handle = h;
    raise exception 'suspended';
  end if;
  tok := _issue_app_session(h);
  return jsonb_build_object('handle', h, 'token', tok);
end $$;
revoke all on function create_passkey_session() from public, anon;
grant execute on function create_passkey_session() to authenticated;

create or replace function verify_app_session(p_handle text, p_token text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(p_token, '') !~ '^bst_[0-9a-f]{64}$' then return false; end if;
  return _check_pass(p_handle, p_token);
end $$;
revoke all on function verify_app_session(text,text) from public;
grant execute on function verify_app_session(text,text) to anon, authenticated;

create or replace function get_account_security(p_handle text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _check_pass(p_handle, p_secret) then raise exception 'auth'; end if;
  return (
    select jsonb_build_object(
      'passkey_linked', auth_user_id is not null,
      'recovery_verified', recovery_verified,
      'recovery_kind', recovery_kind
    ) from accounts where handle = lower(p_handle)
  );
end $$;
revoke all on function get_account_security(text,text) from public;
grant execute on function get_account_security(text,text) to anon, authenticated;

create or replace function sync_recovery_status()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
declare email_ok boolean := false;
declare phone_ok boolean := false;
declare kind text;
begin
  if uid is null then raise exception 'auth'; end if;
  select
    email_confirmed_at is not null
      and coalesce(email, '') <> ''
      and email not like '%@passkey.via-mi.invalid'
      and email not like '%@id.via-mi.com',
    phone_confirmed_at is not null and coalesce(phone, '') <> ''
  into email_ok, phone_ok from auth.users where id = uid;
  if email_ok and phone_ok then kind := 'email+phone';
  elsif email_ok then kind := 'email';
  elsif phone_ok then kind := 'phone';
  else kind := null;
  end if;
  update accounts set recovery_verified = kind is not null, recovery_kind = kind, updated_at = now()
    where auth_user_id = uid;
  return jsonb_build_object('recovery_verified', kind is not null, 'recovery_kind', kind);
end $$;
revoke all on function sync_recovery_status() from public, anon;
grant execute on function sync_recovery_status() to authenticated;

-- The verification badge is public; contact values are never exposed.
create or replace function get_public_page(p_handle text)
returns jsonb language sql security definer stable set search_path = public as $$
  select case
    when not exists (select 1 from profiles where handle = lower(p_handle))
      or exists (
        select 1 from account_moderation
        where handle = lower(p_handle) and suspended
      ) then null
    else jsonb_build_object(
      'profile',
        (select to_jsonb(p) || jsonb_build_object('verified', a.recovery_verified)
           from profiles p join accounts a using (handle)
          where p.handle = lower(p_handle)),
      'channels',
        coalesce((select jsonb_agg(to_jsonb(c) order by c.position, c.id)
                    from channels c where c.handle = lower(p_handle)), '[]'::jsonb),
      'cal',
        coalesce((select jsonb_agg(jsonb_build_object('d', cp.d, 'memo', cp.memo) order by cp.d)
                    from cal_public cp where cp.handle = lower(p_handle)), '[]'::jsonb)
    )
  end;
$$;
revoke all on function get_public_page(text) from public;
grant execute on function get_public_page(text) to anon, authenticated;

-- A short-lived Supabase Auth session can coexist with the app session while a
-- recovery contact is being verified. Existing RPCs still require the bst_ token.
grant execute on function update_profile(text,text,text,text,text,int,text,text,text,int) to authenticated;
grant execute on function save_channels(text,text,jsonb) to authenticated;
grant execute on function save_cal(text,text,date,text) to authenticated;
grant execute on function get_my_follows(text,text) to authenticated;
grant execute on function save_my_follows(text,text,jsonb) to authenticated;
grant execute on function get_clicks(text,text) to authenticated;
grant execute on function delete_account(text,text) to authenticated;
grant execute on function delete_session(text,text) to authenticated;
grant execute on function revoke_other_sessions(text,text) to authenticated;

create or replace function delete_account(p_handle text, p_pass text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare linked_user uuid;
begin
  if not _check_pass(p_handle, p_pass) then raise exception 'auth'; end if;
  select auth_user_id into linked_user from accounts where handle = lower(p_handle);
  delete from accounts where handle = lower(p_handle);
  if linked_user is not null then delete from auth.users where id = linked_user; end if;
end $$;
revoke all on function delete_account(text,text) from public;
grant execute on function delete_account(text,text) to anon, authenticated;
