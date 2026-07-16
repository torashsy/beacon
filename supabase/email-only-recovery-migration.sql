-- 公開時点の復旧手段をメールアドレスだけに絞る。

update accounts a
set
  recovery_verified = u.email_confirmed_at is not null
    and coalesce(u.email, '') <> ''
    and u.email not like '%@passkey.via-mi.invalid'
    and u.email not like '%@id.via-mi.com',
  recovery_kind = case
    when u.email_confirmed_at is not null
      and coalesce(u.email, '') <> ''
      and u.email not like '%@passkey.via-mi.invalid'
      and u.email not like '%@id.via-mi.com'
    then 'email' else null end,
  updated_at = now()
from auth.users u
where a.auth_user_id = u.id;

update accounts
set recovery_verified = false, recovery_kind = null, updated_at = now()
where auth_user_id is null and recovery_kind in ('phone', 'email+phone');

alter table accounts drop constraint if exists accounts_recovery_kind_check;
alter table accounts add constraint accounts_recovery_kind_check
  check (recovery_kind is null or recovery_kind = 'email');

create or replace function _masked_recovery_contacts(p_user uuid)
returns jsonb language sql security definer stable set search_path = public, auth as $$
  select jsonb_build_object(
    'recovery_email_masked',
      case
        when email_confirmed_at is not null
          and coalesce(email, '') <> ''
          and email not like '%@passkey.via-mi.invalid'
          and email not like '%@id.via-mi.com'
        then left(split_part(email, '@', 1), 1) || '***@' || split_part(email, '@', 2)
        else null
      end
  )
  from auth.users where id = p_user;
$$;
revoke all on function _masked_recovery_contacts(uuid) from public, anon, authenticated;

create or replace function get_account_security(p_handle text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare result jsonb;
begin
  if not _check_pass(p_handle, p_secret) then raise exception 'auth'; end if;
  select jsonb_build_object(
      'passkey_linked', auth_user_id is not null,
      'recovery_verified', recovery_verified,
      'recovery_kind', recovery_kind
    ) || coalesce(_masked_recovery_contacts(auth_user_id), jsonb_build_object(
      'recovery_email_masked', null
    ))
  into result from accounts where handle = lower(p_handle);
  return result;
end $$;
revoke all on function get_account_security(text,text) from public;
grant execute on function get_account_security(text,text) to anon, authenticated;

create or replace function sync_recovery_status()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
declare email_ok boolean := false;
declare contacts jsonb;
begin
  if uid is null then raise exception 'auth'; end if;
  select
    email_confirmed_at is not null
      and coalesce(email, '') <> ''
      and email not like '%@passkey.via-mi.invalid'
      and email not like '%@id.via-mi.com'
  into email_ok from auth.users where id = uid;
  update accounts set recovery_verified = email_ok, recovery_kind = case when email_ok then 'email' else null end,
    updated_at = now() where auth_user_id = uid;
  contacts := coalesce(_masked_recovery_contacts(uid), jsonb_build_object('recovery_email_masked', null));
  return jsonb_build_object(
    'recovery_verified', email_ok,
    'recovery_kind', case when email_ok then 'email' else null end
  ) || contacts;
end $$;
revoke all on function sync_recovery_status() from public, anon;
grant execute on function sync_recovery_status() to authenticated;
