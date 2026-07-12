-- 匿名Storage書き込みを廃止し、Edge Function発行の署名付きURLだけに限定する。
drop policy if exists avatars_anon_insert on storage.objects;
drop policy if exists avatars_anon_update on storage.objects;
drop function if exists handle_exists(text);

create table if not exists avatar_upload_attempts (
  handle text not null references accounts(handle) on delete cascade,
  window_start timestamptz not null,
  n integer not null default 0,
  primary key (handle, window_start)
);
alter table avatar_upload_attempts enable row level security;
revoke all on avatar_upload_attempts from anon, authenticated;

create or replace function authorize_avatar_upload(p_handle text, p_pass text)
returns boolean language plpgsql security definer as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  attempts integer;
begin
  if not _check_pass(p_handle, p_pass) then return false; end if;
  insert into avatar_upload_attempts(handle, window_start, n)
    values (lower(p_handle), current_window, 1)
    on conflict (handle, window_start) do update
      set n = avatar_upload_attempts.n + 1
    returning n into attempts;
  if attempts > 30 then raise exception 'upload rate limit'; end if;
  delete from avatar_upload_attempts where window_start < now() - interval '2 days';
  return true;
end $$;

revoke all on function authorize_avatar_upload(text, text) from public, anon, authenticated;
grant execute on function authorize_avatar_upload(text, text) to service_role;
