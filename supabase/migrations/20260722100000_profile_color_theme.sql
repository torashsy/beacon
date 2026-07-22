-- プロフィール固有のカラーテーマ。プロフィールカードのアクセント色を所有者が
-- 選んだ6テーマ(peach/mint/sky/lilac/citrus/mono)にして、他人が見てもその色味で
-- 表示する。明暗(ライト/ダーク)は見る人の環境に合わせるため、DBは色味idのみ保持。
-- get_public_page は to_jsonb(profiles) で全列を返すため、列追加だけで profile に
-- color_theme が含まれる（関数変更不要）。

alter table profiles
  add column if not exists color_theme text not null default 'sky';

-- update_profile に p_color_theme を追加（引数増加＝新シグネチャなので旧を drop）。
drop function if exists update_profile(text,text,text,text,text,int,text,text,text,int);

create or replace function update_profile(p_handle text, p_pass text,
  p_name text, p_bio text, p_emoji text, p_theme int, p_av text, p_bn text,
  p_status text default null, p_av_theme int default 0,
  p_color_theme text default 'sky')
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if length(coalesce(p_name,''))   > 100  then raise exception 'name too long'; end if;
  if length(coalesce(p_bio,''))    > 800  then raise exception 'bio too long'; end if;
  if length(coalesce(p_status,'')) > 200  then raise exception 'status too long'; end if;
  if p_theme not between 0 and 11 or p_av_theme not between 0 and 11 then
    raise exception 'invalid theme';
  end if;
  if coalesce(p_color_theme, 'sky') not in ('peach','mint','sky','lilac','citrus','mono') then
    raise exception 'invalid color theme';
  end if;
  if length(coalesce(p_av,'')) > 2000 or length(coalesce(p_bn,'')) > 2000 then
    raise exception 'image url too long';
  end if;
  update profiles set name=p_name, bio=p_bio, emoji=p_emoji, theme=p_theme, av_theme=p_av_theme,
    av_url=p_av, bn_url=p_bn,
    color_theme = coalesce(p_color_theme, 'sky'),
    status = coalesce(p_status, status),
    status_at = case when p_status is not null and p_status <> coalesce(status,'')
                     then now() else status_at end
    where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

revoke all on function update_profile(text,text,text,text,text,int,text,text,text,int,text) from public, authenticated;
grant execute on function update_profile(text,text,text,text,text,int,text,text,text,int,text) to anon;
