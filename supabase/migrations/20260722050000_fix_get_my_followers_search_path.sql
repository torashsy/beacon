-- get_my_followers の search_path 修正。
--
-- 直前の 20260722000000 で search_path を `public` のみに絞ってしまい、
-- _check_pass が使う pgcrypto の crypt()（extensions スキーマ）が解決できず
-- 「function crypt(text, text) does not exist」で失敗していた。
-- パスコード検証を行う他のRPCと同様に extensions を search_path に含める。

create or replace function get_my_followers(p_handle text, p_pass text)
returns table(handle text, name text, emoji text, av_url text, av_theme int)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _check_pass(p_handle, p_pass) then raise exception 'auth'; end if;
  return query
    select fs.handle, p.name, p.emoji, p.av_url, p.av_theme
    from follows_server fs
    left join profiles p on p.handle = fs.handle
    where fs.target = lower(p_handle)
    order by fs.handle
    limit 1000;
end $$;

revoke all on function get_my_followers(text,text) from public, anon, authenticated;
grant execute on function get_my_followers(text,text) to anon;
