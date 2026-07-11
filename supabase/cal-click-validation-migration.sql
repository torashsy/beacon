-- ============================================================
-- Beacon: save_cal のメモ長検証 + bump_click の濫用防止。SQL Editor で Run（冪等）。
-- ============================================================

create or replace function save_cal(p_handle text, p_pass text,
  p_date date, p_memo text, p_pub boolean)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if length(coalesce(p_memo,'')) > 500 then raise exception 'memo too long'; end if;
  delete from cal_public  where handle=lower(p_handle) and d=p_date;
  delete from cal_private where handle=lower(p_handle) and d=p_date;
  if p_memo <> '' then
    if p_pub then insert into cal_public(handle,d,memo)  values (lower(p_handle),p_date,p_memo);
    else          insert into cal_private(handle,d,memo) values (lower(p_handle),p_date,p_memo);
    end if;
  end if;
end $$;

-- bump_click は匿名・無制限に呼べる（公開ページの訪問者が踏むたび発火）。
-- 修正前は任意のURL文字列を渡せたため、誰でも:
--   1) 巨大な文字列を url に入れて行を肥大化させる
--   2) 実在しないURLを大量に送って link_clicks の行数を無制限に増やす
--      （handle,url が主キーなので url を変え続けるだけで無限に行が増える）
--   3) 偽のクリックを大量計上してクリック解析（一番人気リンク等）を偽装する
-- ことができた。url をその handle の実在する channels.url に一致する場合
-- のみカウントするよう修正し、行数を「そのユーザーのリンク件数以下」
-- （save_channels 側の50件上限と合わせて有限）に固定する。
create or replace function bump_click(p_handle text, p_url text)
returns void language plpgsql security definer as $$
begin
  if length(coalesce(p_url,'')) > 2000 then return; end if;
  if not exists (
    select 1 from channels where handle = lower(p_handle) and url = p_url
  ) then
    return;
  end if;
  insert into link_clicks(handle, url, n)
    values (lower(p_handle), p_url, 1)
    on conflict (handle, url) do update set n = link_clicks.n + 1;
end $$;
