-- ============================================================
-- Beacon: ステータス（ひとこと近況）を profiles に追加。SQL Editor で Run（冪等）。
-- update_profile を status も受け取れるよう差し替える。
-- ============================================================

alter table profiles add column if not exists status    text default '';
alter table profiles add column if not exists status_at timestamptz;

drop function if exists update_profile(text,text,text,text,text,int,text,text);

create or replace function update_profile(p_handle text, p_pass text,
  p_name text, p_bio text, p_emoji text, p_theme int, p_av text, p_bn text,
  p_status text default null)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  update profiles set name=p_name, bio=p_bio, emoji=p_emoji, theme=p_theme,
    av_url=p_av, bn_url=p_bn,
    status = coalesce(p_status, status),
    status_at = case when p_status is not null and p_status <> coalesce(status,'')
                     then now() else status_at end
    where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

grant execute on function update_profile(text,text,text,text,text,int,text,text,text) to anon;
