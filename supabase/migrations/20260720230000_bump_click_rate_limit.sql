-- bump_click は他の書き込みRPCと異なり認証もレート制限も無く、匿名で無制限に
-- 呼べてしまいクリック数の水増しが可能だった。IP単位の短時間ウィンドウで上限を設け、
-- 超過分は静かに無視する（呼び出し元へはエラーを返さない＝既存の「見つからない時は
-- 何もせず返す」挙動と合わせる）。

create table if not exists click_attempts (
  ip text not null,
  window_start timestamptz not null,
  n integer not null default 0,
  primary key (ip, window_start)
);
alter table click_attempts enable row level security;
revoke all on click_attempts from anon, authenticated;

create or replace function bump_click(p_handle text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  client_ip text := 'unknown';
  current_window timestamptz := date_trunc('minute', now());
  attempts integer;
begin
  if length(coalesce(p_url,'')) > 2000 then return; end if;
  if not exists (
    select 1 from channels where handle = lower(p_handle) and url = p_url
  ) then
    return;
  end if;

  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then
    client_ip := 'unknown';
  end;

  insert into click_attempts(ip, window_start, n) values (client_ip, current_window, 1)
    on conflict (ip, window_start) do update set n = click_attempts.n + 1
    returning n into attempts;
  delete from click_attempts where window_start < now() - interval '1 day';
  if attempts > 30 then return; end if;

  insert into link_clicks(handle, url, n)
    values (lower(p_handle), p_url, 1)
    on conflict (handle, url) do update set n = link_clicks.n + 1;
end $$;

revoke all on function bump_click(text,text) from public, authenticated;
grant execute on function bump_click(text,text) to anon;

notify pgrst, 'reload schema';
