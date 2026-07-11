-- ============================================================
-- Beacon: 復旧コード再発行 + フォローのサーバー保存。SQL Editor で Run（冪等）。
-- どちらも本人のパスコード必須。フォローは「本人だけが読める私的ブックマーク」で
-- 横断一覧APIにはしない（cal_private と同じ扱い）。
-- ============================================================

-- ---- 復旧コード再発行（要パス）----
create or replace function reissue_recovery(p_handle text, p_pass text)
returns text language plpgsql security definer as $$
declare rc text;
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  rc := upper(encode(gen_random_bytes(6),'hex'));
  update accounts set rc_hash = crypt(rc, gen_salt('bf')), updated_at=now()
    where handle=lower(p_handle);
  return rc;
end $$;
grant execute on function reissue_recovery(text,text) to anon;

-- ---- フォローのサーバー保存（本人のみ）----
create table if not exists follows_server (
  handle text references accounts(handle) on delete cascade,
  target text not null,
  primary key (handle, target)
);
alter table follows_server enable row level security;
revoke select on follows_server from anon, authenticated;

create or replace function get_my_follows(p_handle text, p_pass text)
returns table(target text) language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  return query select follows_server.target from follows_server
    where handle=lower(p_handle);
end $$;

create or replace function save_my_follows(p_handle text, p_pass text, p_targets jsonb)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  delete from follows_server where handle=lower(p_handle);
  insert into follows_server(handle, target)
    select lower(p_handle), lower(value) from jsonb_array_elements_text(p_targets)
    on conflict do nothing;
end $$;

grant execute on function get_my_follows(text,text)         to anon;
grant execute on function save_my_follows(text,text,jsonb)  to anon;
