-- ============================================================
-- Beacon 本番用スキーマ v2（パスコード認証版）
-- Supabase SQL Editor に貼って Run。
-- 設計原則:
--   1) パスコード検証はすべてサーバー側(RPC)で行う
--   2) followers/検索/一覧APIは作らない（異性紹介事業の回避）
--   3) 画像はDBに入れず Supabase Storage を使う（URLのみ保存）
-- ============================================================

create extension if not exists pgcrypto;

-- 問い合わせフォームは `contact-form-migration.sql` も参照。

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

-- ログイン失敗はハンドル単位でなく接続元IPとの組み合わせで制限する。
create table if not exists login_attempts (
  handle text not null,
  ip text not null,
  fail_count int default 0,
  locked_til timestamptz,
  primary key (handle, ip)
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
alter table login_attempts  enable row level security;
alter table signup_attempts enable row level security;
revoke select on signup_attempts from anon, authenticated;
revoke all on login_attempts from anon, authenticated;

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

-- ---- セッション（ログイン状態の保持）----
-- ログイン成功時にサーバーが失効可能なトークン（'bst_' + 64桁hex）を発行し、
-- 以後はそれで認証する（X/Instagram等と同じ方式）。パスコードは端末に保存しない。
-- サーバーには sha256 ハッシュのみ保存。期限は30日スライド。
create table if not exists sessions (
  token_hash text primary key,
  handle     text not null references accounts(handle) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_handle_idx on sessions(handle);
alter table sessions enable row level security;
revoke all on sessions from anon, authenticated;

-- ---- 認証ヘルパー ----
-- p_pass はパスコードまたはセッショントークンの両方を受ける。
-- トークン形式（'bst_'+64桁hex）に完全一致する文字列だけをトークンとして扱い、
-- 'bst_' で始まるだけの文字列（本物のパスコードかもしれない）はパスコード検証へ。
create or replace function _check_pass(p_handle text, p_pass text)
returns boolean language plpgsql security definer as $$
declare
  a record;
  client_ip text := 'unknown';
begin
  if p_pass ~ '^bst_[0-9a-f]{64}$' then
    update sessions set expires_at = now() + interval '30 days'
      where token_hash = encode(digest(p_pass, 'sha256'), 'hex')
        and handle = lower(p_handle)
        and expires_at > now();
    -- トークン形式に完全一致する文字列はトークンとして最終判定する（不一致でも
    -- パスコード検証へ落とさない）。落とすと期限切れトークンでの自動ログイン失敗が
    -- ログイン失敗カウンタに積まれ、複数タブ起動などでロックを誤爆させてしまう。
    -- 256bit空間の総当たりにカウンタは無意味なので、ここで数えない設計で問題ない。
    return found;
  end if;

  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then
    client_ip := 'unknown';
  end;

  select * into a from login_attempts
    where handle=lower(p_handle) and ip=client_ip;
  if a.locked_til is not null and a.locked_til > now() then
    raise exception 'locked';
  end if;
  if exists(select 1 from accounts where handle=lower(p_handle)
            and pass_hash = crypt(p_pass, pass_hash)) then
    delete from login_attempts where handle=lower(p_handle) and ip=client_ip;
    return true;
  end if;
  if client_ip <> 'unknown' then
    insert into login_attempts(handle,ip,fail_count) values (lower(p_handle),client_ip,1)
      on conflict (handle,ip) do update set
        fail_count = login_attempts.fail_count + 1,
        locked_til = case when login_attempts.fail_count + 1 >= 5
                          then now() + interval '15 minutes' else null end;
  end if;
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

  if length(p_pass) < 10 then raise exception 'pass too short'; end if;
  if octet_length(p_pass) > 72 then raise exception 'pass too long'; end if;
  -- ハンドルの形式・長さはクライアント(cleanHandle)が整形するが、RPCを直接
  -- 呼べば無検証で任意の文字列を通せてしまうため、サーバー側でも検証する。
  if lower(p_handle) !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid handle'; end if;
  if lower(p_handle) = any(array[
    'admin','administrator','official','beacon','support','help','staff',
    'moderator','mod','root','api','system','null','undefined','terms',
    'privacy','robots','test','www','mail'
  ]) then
    raise exception 'taken';
  end if;
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
  if length(p_new) < 10 then raise exception 'pass too short'; end if;
  if octet_length(p_new) > 72 then raise exception 'pass too long'; end if;

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
  -- パスコード再設定時は全セッションを失効させる（盗まれた端末の締め出し）
  delete from sessions where handle=lower(p_handle);
  return true;
end $$;

-- ---- RPC: セッション発行/失効 ----
create or replace function create_session(p_handle text, p_pass text)
returns text language plpgsql security definer as $$
declare tok text;
begin
  if not _check_pass(p_handle, p_pass) then raise exception 'auth'; end if;
  delete from sessions where expires_at < now();  -- 期限切れの掃除（ついで）
  tok := 'bst_' || encode(gen_random_bytes(32), 'hex');
  insert into sessions(token_hash, handle, expires_at)
    values (encode(digest(tok, 'sha256'), 'hex'), lower(p_handle),
            now() + interval '30 days');
  -- 1アカウントのセッションは新しい順に10個まで（トークンの無限蓄積を防ぐ）
  delete from sessions
    where handle = lower(p_handle)
      and token_hash not in (
        select token_hash from sessions
        where handle = lower(p_handle)
        order by created_at desc limit 10);
  return tok;
end $$;

-- セッション失効（ログアウト）。トークン自体が本人性の証明なので追加認証は不要。
create or replace function delete_session(p_handle text, p_token text)
returns void language plpgsql security definer as $$
begin
  delete from sessions
    where handle = lower(p_handle)
      and token_hash = encode(digest(p_token, 'sha256'), 'hex');
end $$;

-- ---- RPC: プロフィール更新 ----
drop function if exists update_profile(text,text,text,text,text,int,text,text);

create or replace function update_profile(p_handle text, p_pass text,
  p_name text, p_bio text, p_emoji text, p_theme int, p_av text, p_bn text,
  p_status text default null)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  -- クライアントの maxLength は UI 制限にすぎず、RPCを直接呼べば無制限に
  -- なるため、DB/表示の肥大化を防ぐ寛容な上限をサーバー側にも設ける。
  if length(coalesce(p_name,''))   > 100  then raise exception 'name too long'; end if;
  if length(coalesce(p_bio,''))    > 1000 then raise exception 'bio too long'; end if;
  if length(coalesce(p_status,'')) > 200  then raise exception 'status too long'; end if;
  if length(coalesce(p_av,'')) > 2000 or length(coalesce(p_bn,'')) > 2000 then
    raise exception 'image url too long';
  end if;
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
  if jsonb_typeof(p_channels) <> 'array' then raise exception 'invalid channels'; end if;
  if jsonb_array_length(p_channels) > 50 then raise exception 'too many channels'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_channels) c
    where length(coalesce(c->>'url',''))   > 2000
       or length(coalesce(c->>'label','')) > 100
       or length(coalesce(c->>'desc',''))  > 300
       or length(coalesce(c->>'img',''))   > 2000
  ) then
    raise exception 'field too long';
  end if;
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
  if length(coalesce(p_memo,'')) > 500 then raise exception 'memo too long'; end if;
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

-- target は「フォロー先のハンドル」なので、ハンドルと同じ形式に一致する
-- 要素のみ受け付ける（件数・要素長を有限に保つ）。形式に合わない要素は
-- raise せず黙って捨てる（クライアントの fire-and-forget 同期を壊さない）。
create or replace function save_my_follows(p_handle text, p_pass text, p_targets jsonb)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if jsonb_typeof(p_targets) <> 'array' then raise exception 'invalid targets'; end if;
  if jsonb_array_length(p_targets) > 500 then raise exception 'too many follows'; end if;
  delete from follows_server where handle=lower(p_handle);
  insert into follows_server(handle, target)
    select lower(p_handle), lower(value) from jsonb_array_elements_text(p_targets)
    where lower(value) ~ '^[a-z0-9_]{3,20}$'
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
grant execute on function create_session(text,text)                                   to anon;
grant execute on function delete_session(text,text)                                   to anon;

-- ---- リンククリック数（本人だけが見られる簡易アナリティクス）----
create table if not exists link_clicks (
  handle text references accounts(handle) on delete cascade,
  url    text not null,
  n      bigint default 0,
  primary key (handle, url)
);
alter table link_clicks enable row level security;
revoke select on link_clicks from anon, authenticated;

-- bump_click は匿名・無制限に呼べる（公開ページ訪問者が踏むたび発火）。
-- url がその handle の実在する channels.url と一致する場合のみカウントする。
-- そうしないと、誰でも任意のURL文字列を送り続けて link_clicks の行数を
-- 無制限に増やしたり（handle,url が主キーなので url を変えるだけで増殖する）、
-- 偽のクリックを大量計上してクリック解析を偽装できてしまう。この制約により
-- 行数は「そのユーザーのリンク件数以下」（save_channels の50件上限と合わせ
-- て有限）に収まる。
create or replace function bump_click(p_handle text, p_url text)
returns void language plpgsql security definer as $$
begin
  if length(coalesce(p_url,'')) > 2000 then return; end if;
  if not exists (
    select 1 from channels where handle = lower(p_handle) and url = p_url
  ) then
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
--      （ブラウザの匿名insert/updateを禁止 + バケットのサイズ/MIME制限）
-- の2段で設定する（本体スキーマの実行を安全に保つため分離）。

create table if not exists avatar_upload_attempts (
  handle text not null references accounts(handle) on delete cascade,
  window_start timestamptz not null,
  n integer not null default 0,
  primary key (handle, window_start)
);
alter table avatar_upload_attempts enable row level security;
revoke all on avatar_upload_attempts from anon, authenticated;

-- Edge Functionだけが呼ぶ認証・毎時上限チェック。署名付きURLの発行前に実行する。
create or replace function authorize_avatar_upload(p_handle text, p_pass text)
returns boolean language plpgsql security definer as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  attempts integer;
begin
  if not _check_pass(p_handle, p_pass) then return false; end if;
  insert into avatar_upload_attempts(handle, window_start, n)
    values (lower(p_handle), current_window, 1)
    on conflict (handle, window_start) do update
      set n = avatar_upload_attempts.n + 1
    returning n into attempts;
  if attempts > 30 then raise exception 'upload rate limit'; end if;
  delete from avatar_upload_attempts where window_start < now() - interval '2 days';
  return true;
end $$;

-- フォロワーの個人一覧は公開せず、合計人数だけを返す。
create or replace function get_follower_count(p_handle text)
returns bigint language sql security definer stable as $$
  select case
    when lower(p_handle) !~ '^[a-z0-9_]{3,20}$' then 0
    else (select count(*) from follows_server where target = lower(p_handle))
  end;
$$;
revoke all on function get_follower_count(text) from public, authenticated;
grant execute on function get_follower_count(text) to anon;
revoke all on function authorize_avatar_upload(text, text) from public, anon, authenticated;
grant execute on function authorize_avatar_upload(text, text) to service_role;

-- ---- 退会後にStorageへ残る画像（アバター/バナー）の定期削除 ----
-- 詳細・設計方針は supabase/storage-cleanup-migration.sql 参照。
-- service_role キーはアプリのコード・環境変数には一切登場せず、Supabase Vault
-- （DB内の暗号化ストア）にのみ保存する。実行は Supabase 内部（pg_cron + pg_net）
-- で完結し、外部のスケジューラ・サーバーレス関数・Vercel環境変数は不要。
-- Vault へのキー投入（vault.create_secret）は本ファイルには含めない（秘密情報
-- のため、適用時に別途1回だけ実行する）。
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists storage_cleanup_log (
  id bigserial primary key,
  ran_at timestamptz default now(),
  orphans_found int,
  files_removed int,
  note text
);
alter table storage_cleanup_log enable row level security;
revoke all on storage_cleanup_log from anon, authenticated;

create or replace function cleanup_orphaned_avatars()
returns void language plpgsql security definer as $$
declare
  svc_key text;
  req_id bigint;
  resp net.http_response_result;
  list_body jsonb;
  folder record;
  orphan_count int := 0;
  removed_count int := 0;
  file_paths text[];
begin
  select decrypted_secret into svc_key
    from vault.decrypted_secrets where name = 'beacon_storage_cleanup_key';
  if svc_key is null then
    insert into storage_cleanup_log(orphans_found, files_removed, note)
      values (0, 0, 'no key configured');
    return;
  end if;

  req_id := net.http_post(
    url := 'https://kciftkinnwkjmlouzmwu.supabase.co/storage/v1/object/list/avatars',
    body := jsonb_build_object('prefix', '', 'limit', 1000),
    headers := jsonb_build_object('Authorization', 'Bearer '||svc_key, 'apikey', svc_key, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
  resp := net.http_collect_response(req_id, false);
  if resp.response is null or resp.response.status_code <> 200 then
    insert into storage_cleanup_log(orphans_found, files_removed, note)
      values (0, 0, 'list failed: '||coalesce(resp.message,'unknown'));
    return;
  end if;
  list_body := resp.response.body::jsonb;

  -- 1回の実行あたり最大20フォルダまで（同期HTTP呼び出しを繰り返すため、
  -- 一度に大量処理すると実行時間が伸びる。週次実行なので数回に分けて
  -- 追いつく設計で十分）。
  for folder in
    select value->>'name' as name
    from jsonb_array_elements(list_body) value
    where value->>'id' is null  -- id が null = フォルダ
      and not exists (select 1 from accounts a where a.handle = value->>'name')
    limit 20
  loop
    orphan_count := orphan_count + 1;

    req_id := net.http_post(
      url := 'https://kciftkinnwkjmlouzmwu.supabase.co/storage/v1/object/list/avatars',
      body := jsonb_build_object('prefix', folder.name||'/', 'limit', 1000),
      headers := jsonb_build_object('Authorization', 'Bearer '||svc_key, 'apikey', svc_key, 'Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
    resp := net.http_collect_response(req_id, false);
    if resp.response is not null and resp.response.status_code = 200 then
      select array_agg(folder.name||'/'||(f->>'name'))
        into file_paths
        from jsonb_array_elements(resp.response.body::jsonb) f;

      if file_paths is not null and array_length(file_paths, 1) > 0 then
        req_id := net.http_delete(
          url := 'https://kciftkinnwkjmlouzmwu.supabase.co/storage/v1/object/avatars',
          body := jsonb_build_object('prefixes', file_paths),
          headers := jsonb_build_object('Authorization', 'Bearer '||svc_key, 'apikey', svc_key, 'Content-Type', 'application/json'),
          timeout_milliseconds := 10000
        );
        resp := net.http_collect_response(req_id, false);
        if resp.response is not null and resp.response.status_code = 200 then
          removed_count := removed_count + array_length(file_paths, 1);
        end if;
      end if;
    end if;
  end loop;

  insert into storage_cleanup_log(orphans_found, files_removed, note)
    values (orphan_count, removed_count, 'ok');
exception when others then
  insert into storage_cleanup_log(orphans_found, files_removed, note)
    values (0, 0, 'error: '||sqlerrm);
end $$;

-- 毎週日曜 4:00 UTC に実行
select cron.schedule('cleanup-orphaned-avatars', '0 4 * * 0', $$select cleanup_orphaned_avatars();$$);

-- フォローリストはサーバーに置かない（端末ローカル保存）。
-- 未フォロー利用者の取得はID完全一致に限定する。名前・属性・ハッシュタグ等による
-- 横断検索、利用者一覧、おすすめ表示は公開範囲と安全設計を見直すまで実装しない。

-- ---- 公開運用: 問い合わせ対応状態・アカウント停止 ----
alter table contact_submissions
  add column if not exists status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved', 'rejected')),
  add column if not exists admin_note text not null default '',
  add column if not exists handled_at timestamptz;

create table if not exists account_moderation (
  handle text primary key references accounts(handle) on delete cascade,
  suspended boolean not null default false,
  reason text not null default '',
  updated_at timestamptz not null default now()
);
alter table account_moderation enable row level security;
revoke all on account_moderation from anon, authenticated;

create table if not exists moderation_log (
  id bigserial primary key,
  handle text not null,
  action text not null check (action in ('suspend', 'restore')),
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table moderation_log enable row level security;
revoke all on moderation_log from anon, authenticated;

create or replace function set_account_suspension(
  p_handle text, p_suspended boolean, p_reason text default ''
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from accounts where handle=lower(p_handle)) then
    raise exception 'not found';
  end if;
  if length(coalesce(p_reason,'')) > 500 then raise exception 'reason too long'; end if;
  insert into account_moderation(handle,suspended,reason,updated_at)
    values(lower(p_handle),p_suspended,trim(coalesce(p_reason,'')),now())
    on conflict(handle) do update set suspended=excluded.suspended,
      reason=excluded.reason, updated_at=now();
  insert into moderation_log(handle,action,reason)
    values(lower(p_handle),case when p_suspended then 'suspend' else 'restore' end,
      trim(coalesce(p_reason,'')));
  if p_suspended then delete from sessions where handle=lower(p_handle); end if;
end $$;
revoke all on function set_account_suspension(text,boolean,text) from public, anon, authenticated;
grant execute on function set_account_suspension(text,boolean,text) to service_role;

create or replace function set_contact_status(p_id bigint, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('new','reviewing','resolved','rejected') then raise exception 'invalid status'; end if;
  if length(coalesce(p_note,'')) > 2000 then raise exception 'note too long'; end if;
  update contact_submissions set status=p_status, admin_note=trim(coalesce(p_note,'')),
    handled_at=case when p_status in ('resolved','rejected') then now() else null end
    where id=p_id;
end $$;
revoke all on function set_contact_status(bigint,text,text) from public, anon, authenticated;
grant execute on function set_contact_status(bigint,text,text) to service_role;

create or replace function get_public_page(p_handle text)
returns jsonb language sql security definer stable set search_path = public as $$
  select case
    when not exists (select 1 from profiles where handle = lower(p_handle))
      or exists (select 1 from account_moderation where handle=lower(p_handle) and suspended)
      then null
    else jsonb_build_object(
      'profile', (select to_jsonb(p) from profiles p where p.handle = lower(p_handle)),
      'channels', coalesce((select jsonb_agg(to_jsonb(c) order by c.position, c.id)
        from channels c where c.handle = lower(p_handle)), '[]'::jsonb),
      'cal', coalesce((select jsonb_agg(jsonb_build_object('d', cp.d, 'memo', cp.memo) order by cp.d)
        from cal_public cp where cp.handle = lower(p_handle)), '[]'::jsonb)
    )
  end;
$$;
create or replace function get_follower_count(p_handle text)
returns bigint language sql security definer stable set search_path = public as $$
  select case
    when lower(p_handle) !~ '^[a-z0-9_]{3,20}$'
      or exists (select 1 from account_moderation where handle=lower(p_handle) and suspended)
      then 0
    else (select count(*) from follows_server where target = lower(p_handle))
  end;
$$;
revoke all on function get_public_page(text) from public, authenticated;
grant execute on function get_public_page(text) to anon;
revoke all on function get_follower_count(text) from public, authenticated;
grant execute on function get_follower_count(text) to anon;
