-- ============================================================
-- Beacon: リンククリック数（本人だけが見られる簡易アナリティクス）
-- SQL Editor で Run（冪等）。litlink では有料の機能を無料で提供する。
-- URL 単位で集計（channels は保存のたび作り直されるため id ではなく url をキーにする）。
-- ============================================================

create table if not exists link_clicks (
  handle text references accounts(handle) on delete cascade,
  url    text not null,
  n      bigint default 0,
  primary key (handle, url)
);

alter table link_clicks enable row level security;
-- 直接読み書きは不可。集計は bump_click、閲覧は get_clicks(要パス) のRPC経由のみ。
revoke select on link_clicks from anon, authenticated;

-- 訪問者がリンクを踏んだら +1（匿名可・存在するハンドルのみ）
create or replace function bump_click(p_handle text, p_url text)
returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from accounts where handle = lower(p_handle)) then
    return;
  end if;
  insert into link_clicks(handle, url, n)
    values (lower(p_handle), p_url, 1)
    on conflict (handle, url) do update set n = link_clicks.n + 1;
end $$;

-- 本人がクリック数を取得（要パスコード）
create or replace function get_clicks(p_handle text, p_pass text)
returns table(url text, n bigint) language plpgsql security definer as $$
begin
  if not _check_pass(p_handle, p_pass) then raise exception 'auth'; end if;
  return query
    select link_clicks.url, link_clicks.n
    from link_clicks where handle = lower(p_handle);
end $$;

grant execute on function bump_click(text, text) to anon;
grant execute on function get_clicks(text, text) to anon;
