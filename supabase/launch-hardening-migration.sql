-- ============================================================
-- Beacon: 公開前ハードニング（B: ストレージ濫用防止 / C: 大量アカウント作成対策 /
-- F: 復旧コード総当たり対策）。SQL Editor で Run（冪等）。
-- ============================================================

-- ---- B: avatars バケットにサイズ上限・MIME制限を設定 ----
-- クライアント(storage.ts)は常に画像を256/800/200px にリサイズしJPEGで送るため、
-- 5MB・image/jpeg|png|webp の制限は正規の利用を妨げない。
update storage.buckets
  set file_size_limit = 5242880, -- 5MB
      allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'avatars';

-- ---- B: アップロード先を「実在するハンドルのフォルダ」に限定 ----
-- storage.objects の RLS からは accounts テーブルを直接参照できない（anon には
-- select 権限が無い）ため、security definer の判定関数を経由する。
create or replace function handle_exists(p_handle text)
returns boolean language sql security definer stable as $$
  select exists(select 1 from accounts where handle = lower(p_handle));
$$;
grant execute on function handle_exists(text) to anon;

drop policy if exists avatars_anon_insert on storage.objects;
create policy avatars_anon_insert on storage.objects
  for insert to anon
  with check (
    bucket_id = 'avatars'
    and handle_exists((storage.foldername(name))[1])
  );

-- update ポリシーは不要（storage.ts は upsert を使わず常にユニークファイル名で
-- INSERT するため）。未使用の書込権限を残さないよう削除する。
drop policy if exists avatars_anon_update on storage.objects;

-- ---- C: アカウント作成のレート制限（同一IPから1日あたり）----
create table if not exists signup_attempts (
  ip  text not null,
  day date not null default current_date,
  n   int  default 0,
  primary key (ip, day)
);
alter table signup_attempts enable row level security;
revoke select on signup_attempts from anon, authenticated;

create or replace function create_account(p_handle text, p_pass text)
returns text language plpgsql security definer as $$
declare
  rc text;
  client_ip text := 'unknown';
  attempts int;
begin
  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then
    client_ip := 'unknown';
  end;

  insert into signup_attempts(ip, n) values (client_ip, 1)
    on conflict (ip, day) do update set n = signup_attempts.n + 1
    returning n into attempts;
  if attempts > 20 then
    raise exception 'too many accounts created from this network today';
  end if;

  if length(p_pass) < 6 then raise exception 'pass too short'; end if;
  if exists(select 1 from accounts where handle=lower(p_handle)) then
    raise exception 'taken';
  end if;
  rc := upper(encode(gen_random_bytes(6),'hex'));
  insert into accounts(handle,pass_hash,rc_hash)
    values (lower(p_handle), crypt(p_pass, gen_salt('bf')), crypt(rc, gen_salt('bf')));
  insert into profiles(handle) values (lower(p_handle));
  return rc;
end $$;

-- ---- F: 復旧コードの総当たり対策（ログイン試行とは別カウンタ）----
-- 注意: PL/pgSQL は raise exception で関数全体のトランザクションを丸ごと
-- ロールバックする。「誤り回数カウンタを更新してから raise」だと、その
-- raise自体でカウンタ更新も一緒に巻き戻ってしまい、何回失敗してもロック
-- されない（_check_pass が『誤りは例外にせず false を返す』設計になって
-- いるのと同じ理由）。reset_pass も boolean を返す方式に変更し、誤りの
-- カウンタ更新を確実にコミットさせる。クライアント側は false を例外化する。
alter table auth_attempts add column if not exists rc_fail_count int default 0;
alter table auth_attempts add column if not exists rc_locked_til timestamptz;

drop function if exists reset_pass(text, text, text);
create function reset_pass(p_handle text, p_rc text, p_new text)
returns boolean language plpgsql security definer as $$
declare a record;
begin
  if length(p_new) < 6 then raise exception 'pass too short'; end if;

  select * into a from auth_attempts where handle=lower(p_handle);
  if a.rc_locked_til is not null and a.rc_locked_til > now() then
    raise exception 'locked';
  end if;

  if not exists(select 1 from accounts where handle=lower(p_handle)
                and rc_hash = crypt(upper(p_rc), rc_hash)) then
    insert into auth_attempts(handle, rc_fail_count) values (lower(p_handle), 1)
      on conflict (handle) do update set
        rc_fail_count = auth_attempts.rc_fail_count + 1,
        rc_locked_til = case when auth_attempts.rc_fail_count + 1 >= 5
                             then now() + interval '15 minutes'
                             else auth_attempts.rc_locked_til end;
    return false;
  end if;

  update auth_attempts set rc_fail_count = 0, rc_locked_til = null
    where handle=lower(p_handle);
  update accounts set pass_hash = crypt(p_new, gen_salt('bf')), updated_at=now()
    where handle=lower(p_handle);
  return true;
end $$;
grant execute on function reset_pass(text,text,text) to anon;
