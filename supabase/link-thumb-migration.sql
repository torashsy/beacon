-- ============================================================
-- Beacon: リンク個別サムネイル（channels.img_url）
-- SQL Editor で Run（冪等）。save_channels が JSON の "img" を取り込むよう更新。
-- ============================================================

alter table channels add column if not exists img_url text default '';

create or replace function save_channels(p_handle text, p_pass text, p_channels jsonb)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  delete from channels where handle=lower(p_handle);
  insert into channels(handle,type,url,label,descr,status,position,img_url)
  select lower(p_handle), c->>'type', c->>'url',
         coalesce(c->>'label',''), coalesce(c->>'desc',''),
         coalesce(c->>'status','live'), (row_number() over ())::int,
         coalesce(c->>'img','')
  from jsonb_array_elements(p_channels) c;
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;
