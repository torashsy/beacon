-- ============================================================
-- Beacon 本番用スキーマ v2（パスコード認証版）
-- Supabase SQL Editor に貼って Run。
-- 設計原則:
--   1) パスコード検証はすべてサーバー側(RPC)で行う
--   2) followers/検索/一覧APIは作らない（異性紹介事業の回避）
--   3) 画像はDBに入れず Supabase Storage を使う（URLのみ保存）
-- ============================================================

create extension if not exists pgcrypto;

-- ---- アカウント ----
create table if not exists accounts (
  handle      text primary key,
  pass_hash   text not null,             -- crypt() によるハッシュ
  rc_hash     text not null,             -- 復旧コードのハッシュ
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists profiles (
  handle   text primary key references accounts(handle) on delete cascade,
  name     text default '',
  bio      text default '',
  emoji    text default '🙂',
  theme    int  default 0,
  av_url   text default '',              -- Storage の公開URL
  bn_url   text default '',
  status   text default '',              -- ひとこと近況
  status_at timestamptz                  -- 近況の更新時刻
);

create table if not exists channels (
  id       uuid primary key default gen_random_uuid(),
  handle   text references accounts(handle) on delete cascade,
  type     text not null,
  url      text not null,
  label    text default '',
  descr    text default '',
  status   text default 'live' check (status in ('live','dead')),
  position int  default 0,
  img_url  text default ''                -- リンク個別サムネイル（Storage の公開URL）
);

-- 公開カレンダー（pub=true のメモのみこのテーブルに置く。非公開メモは別テーブル）
create table if not exists cal_public (
  handle  text references accounts(handle) on delete cascade,
  d       date not null,
  memo    text not null,
  primary key (handle, d)
);

create table if not exists cal_private (
  handle  text references accounts(handle) on delete cascade,
  d       date not null,
  memo    text not null,
  primary key (handle, d)
);

-- ログイン試行制限（総当たり対策）。rc_* は復旧コード再設定の総当たり対策
-- （ログイン試行とは別カウンタ。詳細は reset_pass のコメント参照）。
create table if not exists auth_attempts (
  handle        text primary key,
  fail_count    int default 0,
  locked_til    timestamptz,
  rc_fail_count int default 0,
  rc_locked_til timestamptz
);

-- アカウント作成のレート制限（同一IPから1日あたり）
create table if not exists signup_attempts (
  ip  text not null,
  day date not null default current_date,
  n   int  default 0,
  primary key (ip, day)
);

-- ---- RLS ----
alter table accounts      enable row level security;
alter table profiles      enable row level security;
alter table channels      enable row level security;
alter table cal_public    enable row level security;
alter table cal_private   enable row level security;
alter table auth_attempts   enable row level security;
alter table signup_attempts enable row level security;
revoke select on signup_attempts from anon, authenticated;

-- 公開読み取り: profiles / channels / cal_public のみ
drop policy if exists pub_profiles on profiles;
create policy pub_profiles on profiles for select using (true);
drop policy if exists pub_channels on channels;
create policy pub_channels on channels for select using (true);
drop policy if exists pub_calpub on cal_public;
create policy pub_calpub on cal_public for select using (true);
-- accounts / cal_private / auth_attempts は誰も直接読めない（RPC経由のみ）
--
-- 【重要・列挙防止】profiles / channels / cal_public には anon の直接 SELECT 権限を
-- 与えない。PostgREST 経由の直接 select を許すと anon キー（公開）で
-- `select * from profiles` により全ユーザーを一括取得（スクレイピング）できてしまい、
-- 「横断的な一覧・検索を提供しない」という設計原則に反する。
-- 公開ページは必ずハンドル指定の get_public_page(handle) 経由でのみ読む。
-- （既に grant 済みの環境向けに明示的に revoke しておく）
revoke select on profiles   from anon, authenticated;
revoke select on channels   from anon, authenticated;
revoke select on cal_public from anon, authenticated;

-- ---- 認証ヘルパー ----
create or replace function _check_pass(p_handle text, p_pass text)
returns boolean language plpgsql security definer as $$
declare a record;
begin
  select * into a from auth_attempts where handle=lower(p_handle);
  if a.locked_til is not null and a.locked_til > now() then
    raise exception 'locked';
  end if;
  if exists(select 1 from accounts where handle=lower(p_handle)
            and pass_hash = crypt(p_pass, pass_hash)) then
    delete from auth_attempts where handle=lower(p_handle);
    return true;
  end if;
  insert into auth_attempts(handle,fail_count) values (lower(p_handle),1)
    on conflict (handle) do update set
      fail_count = auth_attempts.fail_count + 1,
      locked_til = case when auth_attempts.fail_count + 1 >= 5
                        then now() + interval '15 minutes' else null end;
  return false;
end $$;

-- ---- RPC: アカウント作成（同一IPから1日20件を超える作成は拒否）----
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
  return rc;  -- 復旧コードは一度だけ返す（サーバーには平文を残さない）
end $$;

-- ---- RPC: ログイン検証（成功時のみtrue。以降の書込RPCは毎回パスコード必須）----
create or replace function verify_login(p_handle text, p_pass text)
returns boolean language sql security definer as $$
  select _check_pass(p_handle, p_pass);
$$;

-- ---- RPC: パスコード再設定（復旧コード）----
-- boolean を返す設計（void + raise exception にしない）に注意: PL/pgSQL の
-- raise exception は関数呼び出し全体のトランザクションを丸ごとロールバックする。
-- 「誤り回数カウンタを更新してから raise」だと、その raise 自体でカウンタ更新も
-- 一緒に巻き戻り、何回失敗してもロックされない。_check_pass が誤りを例外にせず
-- false を返す設計になっているのと同じ理由で、ここも false を返してカウンタ更新を
-- 確実にコミットさせる（呼び出し側 rpc.ts が false を例外化する）。
create or replace function reset_pass(p_handle text, p_rc text, p_new text)
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

-- ---- RPC: プロフィール更新 ----
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

-- ---- RPC: チャンネル一括保存（並び順ごと差し替え）----
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

-- ---- RPC: カレンダー保存 ----
create or replace function save_cal(p_handle text, p_pass text,
  p_date date, p_memo text, p_pub boolean)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  delete from cal_public  where handle=lower(p_handle) and d=p_date;
  delete from cal_private where handle=lower(p_handle) and d=p_date;
  if p_memo <> '' then
    if p_pub then insert into cal_public(handle,d,memo)  values (lower(p_handle),p_date,p_memo);
    else          insert into cal_private(handle,d,memo) values (lower(p_handle),p_date,p_memo);
    end if;
  end if;
end $$;

-- ---- RPC: 自分の非公開カレンダー取得 ----
create or replace function get_private_cal(p_handle text, p_pass text)
returns table(d date, memo text) language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  return query select cal_private.d, cal_private.memo
    from cal_private where handle=lower(p_handle);
end $$;

-- ---- RPC: 公開ページ取得（ハンドル1件のみ。列挙不可）----
-- profiles/channels/cal_public への直接 select は許可していないため、
-- 公開ページはこの security definer 関数でハンドルを1件指定して読む。
create or replace function get_public_page(p_handle text)
returns jsonb language sql security definer stable as $$
  select case
    when not exists (select 1 from profiles where handle = lower(p_handle))
      then null
    else jsonb_build_object(
      'profile',
        (select to_jsonb(p) from profiles p where p.handle = lower(p_handle)),
      'channels',
        coalesce(
          (select jsonb_agg(to_jsonb(c) order by c.position, c.id)
             from channels c where c.handle = lower(p_handle)),
          '[]'::jsonb),
      'cal',
        coalesce(
          (select jsonb_agg(jsonb_build_object('d', cp.d, 'memo', cp.memo)
                             order by cp.d)
             from cal_public cp where cp.handle = lower(p_handle)),
          '[]'::jsonb)
    )
  end;
$$;

-- ---- RPC: 復旧コード再発行（要パス。復旧コードを控え損ねた/使ってしまった対策）----
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

-- ---- フォローのサーバー保存（本人だけが読める私的ブックマーク。横断一覧APIにはしない）----
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

-- ---- RPC: アカウント削除（退会）----
create or replace function delete_account(p_handle text, p_pass text)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  delete from accounts where handle=lower(p_handle);
end $$;

grant execute on function create_account(text,text)                                   to anon;
grant execute on function verify_login(text,text)                                     to anon;
grant execute on function reset_pass(text,text,text)                                  to anon;
grant execute on function update_profile(text,text,text,text,text,int,text,text,text) to anon;
grant execute on function save_channels(text,text,jsonb)                              to anon;
grant execute on function save_cal(text,text,date,text,boolean)                       to anon;
grant execute on function get_private_cal(text,text)                                  to anon;
grant execute on function get_public_page(text)                                       to anon;
grant execute on function reissue_recovery(text,text)                                 to anon;
grant execute on function get_my_follows(text,text)                                   to anon;
grant execute on function save_my_follows(text,text,jsonb)                            to anon;
grant execute on function delete_account(text,text)                                   to anon;

-- ---- リンククリック数（本人だけが見られる簡易アナリティクス）----
create table if not exists link_clicks (
  handle text references accounts(handle) on delete cascade,
  url    text not null,
  n      bigint default 0,
  primary key (handle, url)
);
alter table link_clicks enable row level security;
revoke select on link_clicks from anon, authenticated;

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

-- ---- Storage（画像用: avatars バケット）----
-- パス規約: avatars/{handle}/{av|bn|thumb}-{timestamp}.jpg
-- バケット作成と anon 書込ポリシーは storage スキーマ（supabase_storage_admin 所有）
-- への操作で、SQL Editor から直接 insert/create policy すると環境によっては
-- 権限エラーになる。そのためこの schema.sql には含めず、SETUP.md 手順3で
--   1) ダッシュボードで 'avatars'(public) バケットを作成
--   2) supabase/storage-policies.sql を SQL Editor で実行
--      （anon の insert を「実在するハンドルのフォルダのみ」に限定 + バケットの
--       サイズ/MIME制限。濫用防止のため anon の update ポリシーは付与しない）
-- の2段で設定する（本体スキーマの実行を安全に保つため分離）。

-- avatars_anon_insert ポリシー（storage-policies.sql）が参照する判定関数。
-- storage.objects の RLS からは accounts テーブルを直接参照できない（anon には
-- select 権限が無い）ため、security definer で判定する。
create or replace function handle_exists(p_handle text)
returns boolean language sql security definer stable as $$
  select exists(select 1 from accounts where handle = lower(p_handle));
$$;
grant execute on function handle_exists(text) to anon;

-- フォローリストはサーバーに置かない（端末ローカル保存）。
-- 発信者を横断的に検索・一覧するAPI/画面は絶対に実装しないこと。
