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
  bn_url   text default ''
);

create table if not exists channels (
  id       uuid primary key default gen_random_uuid(),
  handle   text references accounts(handle) on delete cascade,
  type     text not null,
  url      text not null,
  label    text default '',
  descr    text default '',
  status   text default 'live' check (status in ('live','dead')),
  position int  default 0
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

-- ログイン試行制限（総当たり対策）
create table if not exists auth_attempts (
  handle      text primary key,
  fail_count  int default 0,
  locked_til  timestamptz
);

-- ---- RLS ----
alter table accounts      enable row level security;
alter table profiles      enable row level security;
alter table channels      enable row level security;
alter table cal_public    enable row level security;
alter table cal_private   enable row level security;
alter table auth_attempts enable row level security;

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

-- ---- RPC: アカウント作成 ----
create or replace function create_account(p_handle text, p_pass text)
returns text language plpgsql security definer as $$
declare rc text;
begin
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
create or replace function reset_pass(p_handle text, p_rc text, p_new text)
returns void language plpgsql security definer as $$
begin
  if length(p_new) < 6 then raise exception 'pass too short'; end if;
  if not exists(select 1 from accounts where handle=lower(p_handle)
                and rc_hash = crypt(upper(p_rc), rc_hash)) then
    raise exception 'bad recovery code';
  end if;
  update accounts set pass_hash = crypt(p_new, gen_salt('bf')), updated_at=now()
    where handle=lower(p_handle);
end $$;

-- ---- RPC: プロフィール更新 ----
create or replace function update_profile(p_handle text, p_pass text,
  p_name text, p_bio text, p_emoji text, p_theme int, p_av text, p_bn text)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  update profiles set name=p_name, bio=p_bio, emoji=p_emoji, theme=p_theme,
    av_url=p_av, bn_url=p_bn where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

-- ---- RPC: チャンネル一括保存（並び順ごと差し替え）----
create or replace function save_channels(p_handle text, p_pass text, p_channels jsonb)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  delete from channels where handle=lower(p_handle);
  insert into channels(handle,type,url,label,descr,status,position)
  select lower(p_handle), c->>'type', c->>'url',
         coalesce(c->>'label',''), coalesce(c->>'desc',''),
         coalesce(c->>'status','live'), (row_number() over ())::int
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
grant execute on function update_profile(text,text,text,text,text,int,text,text)      to anon;
grant execute on function save_channels(text,text,jsonb)                              to anon;
grant execute on function save_cal(text,text,date,text,boolean)                       to anon;
grant execute on function get_private_cal(text,text)                                  to anon;
grant execute on function get_public_page(text)                                       to anon;
grant execute on function delete_account(text,text)                                   to anon;

-- ---- Storage（画像用: avatars バケット）----
-- パス規約: avatars/{handle}/av.jpg, avatars/{handle}/bn.jpg
-- バケット作成と anon 書込ポリシーは storage スキーマ（supabase_storage_admin 所有）
-- への操作で、SQL Editor から直接 insert/create policy すると環境によっては
-- 権限エラーになる。そのためこの schema.sql には含めず、SETUP.md 手順3で
--   1) ダッシュボードで 'avatars'(public) バケットを作成
--   2) supabase/storage-policies.sql を SQL Editor で実行（anon の insert/update 許可）
-- の2段で設定する（本体スキーマの実行を安全に保つため分離）。

-- フォローリストはサーバーに置かない（端末ローカル保存）。
-- 発信者を横断的に検索・一覧するAPI/画面は絶対に実装しないこと。
