-- ============================================================
-- Beacon: セッショントークン方式の導入。SQL Editor で Run（冪等）。
--
-- これまでは「パスコードをメモリだけに持ち、リロードごとに再入力」（方式a）で、
-- 任意アドオンの「この端末を信頼する」はパスコード自体を localStorage に
-- 難読化保存する応急処置だった。X/Instagram 等と同じく、ログイン成功時に
-- サーバーが失効可能なランダムトークンを発行し、以後はそれで認証する方式に
-- 移行する。パスコードそのものは端末に保存しない。
--
--   - トークンは 'bst_' + 64桁hex（256bit乱数）。総当たりは事実上不可能。
--   - サーバーには sha256 ハッシュのみ保存（DB漏えい時もトークンを復元できない）。
--   - 期限は30日スライド（使うたび延長）。パスコード再設定で全セッション失効。
--   - _check_pass がトークンも受けるため、既存の全RPCは無変更でトークンを
--     p_pass として受け付ける。
-- ============================================================

create table if not exists sessions (
  token_hash text primary key,
  handle     text not null references accounts(handle) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_handle_idx on sessions(handle);
alter table sessions enable row level security;
revoke all on sessions from anon, authenticated;

-- トークン分岐を追加。有効なトークンなら期限をスライド延長して即 true。
-- トークン形式（'bst_'+64桁hex）に完全一致する文字列だけをトークンとして扱い、
-- 'bst_' で始まるだけの文字列（本物のパスコードかもしれない）はパスコード検証へ。
create or replace function _check_pass(p_handle text, p_pass text)
returns boolean language plpgsql security definer as $$
declare a record;
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

-- セッション発行（要認証。有効なトークンからの再発行も可）。
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

-- パスコード再設定時は全セッションを失効させる（盗まれた端末の締め出しに使える）。
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
  delete from sessions where handle=lower(p_handle);
  return true;
end $$;

grant execute on function create_session(text,text) to anon;
grant execute on function delete_session(text,text) to anon;
