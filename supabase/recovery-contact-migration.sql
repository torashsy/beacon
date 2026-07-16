-- 本人の設定画面に、確認済みの復旧連絡先をマスクして返す。
-- 生のメールアドレス・電話番号はauth.usersだけに保持し、publicスキーマへ複製しない。

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
      end,
    'recovery_phone_masked',
      case
        when phone_confirmed_at is null or coalesce(phone, '') = '' then null
        when phone ~ '^\+81[0-9]{10}$'
          then '0' || substr(phone, 4, 2) || '-****-' || right(phone, 4)
        else left(phone, greatest(1, length(phone) - 8)) || '****' || right(phone, 4)
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
      'recovery_email_masked', null,
      'recovery_phone_masked', null
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
declare phone_ok boolean := false;
declare kind text;
declare contacts jsonb;
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
  contacts := coalesce(_masked_recovery_contacts(uid), jsonb_build_object(
    'recovery_email_masked', null,
    'recovery_phone_masked', null
  ));
  return jsonb_build_object('recovery_verified', kind is not null, 'recovery_kind', kind) || contacts;
end $$;
revoke all on function sync_recovery_status() from public, anon;
grant execute on function sync_recovery_status() to authenticated;
