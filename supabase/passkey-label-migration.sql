-- via-mi: shorter WebAuthn account labels use <handle>@id.via-mi.com.
-- Treat both the original UUID label and the shorter label as internal addresses.
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
