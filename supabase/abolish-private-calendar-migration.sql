-- カレンダーの公開/非公開の区別を廃止し、すべて公開にする。SQL Editor で Run（冪等）。
-- 既存の非公開メモは公開カレンダーへ移す（同日に公開メモが既にある場合は公開側を優先し、
-- 非公開側は破棄する）。移行後、非公開カレンダーの関数・テーブルを削除する。
insert into cal_public (handle, d, memo)
  select handle, d, memo from cal_private
  on conflict (handle, d) do nothing;

drop function if exists save_cal(text, text, date, text, boolean);
drop function if exists get_private_cal(text, text);

create or replace function save_cal(p_handle text, p_pass text,
  p_date date, p_memo text)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if length(coalesce(p_memo,'')) > 500 then raise exception 'memo too long'; end if;
  delete from cal_public where handle=lower(p_handle) and d=p_date;
  if p_memo <> '' then
    insert into cal_public(handle,d,memo) values (lower(p_handle),p_date,p_memo);
  end if;
end $$;
revoke all on function save_cal(text,text,date,text) from public;
grant execute on function save_cal(text,text,date,text) to anon, authenticated;

drop table if exists cal_private;
