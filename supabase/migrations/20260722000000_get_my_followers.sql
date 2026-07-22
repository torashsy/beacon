-- フォロワー一覧（本人だけが自分のフォロワーを閲覧できる）。
--
-- follows_server は「本人だけが読める私的ブックマーク」で、これまで公開してきた
-- のはフォロワー"数"のみ(get_follower_count)だった。ここでは本人がパスコード
-- 認証したうえで、自分をフォローしている相手の一覧を取得できる RPC を追加する。
-- 他人のフォロワー一覧・ユーザー検索・おすすめ（＝横断的な発見機能）は引き続き
-- 作らない。返すのは表示に必要な公開プロフィール項目のみ。
--
-- fs.handle = フォローしている側（＝フォロワー）、fs.target = フォローされている側。
-- したがって p_handle のフォロワーは target = p_handle の行の fs.handle。

create or replace function get_my_followers(p_handle text, p_pass text)
returns table(handle text, name text, emoji text, av_url text, av_theme int)
language plpgsql security definer set search_path = public as $$
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
