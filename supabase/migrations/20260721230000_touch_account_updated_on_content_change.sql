-- フォロー一覧の「更新時刻」は accounts.updated_at（get_public_page が profile.updated_at
-- として返す）を表示している。しかし実際の公開コンテンツ変更のほとんどが updated_at を
-- 動かしていなかった:
--   update_profile   (名前/自己紹介/アイコン/テーマ/ヘッダー/状態) → 動かさない
--   save_channels    (リンク)                                      → 動かさない
--   save_cal         (カレンダー予定)                              → 動かさない
--   sync_recovery_status (復旧設定・非公開)                        → 動かす（誤り）
-- 結果、名前やリンクを更新しても時刻が進まず、復旧メールを触ると（公開内容は不変なのに）
-- 時刻が進む、という食い違いが起きていた。
--
-- 対策: 公開コンテンツを持つテーブル（profiles / channels / cal_public）への書き込みで
-- accounts.updated_at を自動更新するトリガーを1つ用意する。各RPCの本体は書き換えないので
-- 影響範囲が小さく、将来の書き込み経路も自動的にカバーできる。あわせて非公開の
-- sync_recovery_status からは updated_at のバンプを取り除く。
-- accounts への書き込みにはトリガーを付けないため、この関数自身の update で再帰しない。

create or replace function touch_account_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare h text;
begin
  if tg_op = 'DELETE' then
    h := old.handle;
  else
    h := new.handle;
  end if;
  if h is not null then
    update accounts set updated_at = now() where handle = h;
  end if;
  return null; -- AFTER トリガーのため戻り値は無視される
end
$$;

revoke all on function touch_account_updated() from public, anon, authenticated;

-- プロフィール本体（名前/自己紹介/アイコン/テーマ/状態/content 等）の更新
drop trigger if exists trg_touch_account on profiles;
create trigger trg_touch_account
  after update on profiles
  for each row execute function touch_account_updated();

-- リンク（save_channels は入れ替えで delete/insert する）
drop trigger if exists trg_touch_account on channels;
create trigger trg_touch_account
  after insert or update or delete on channels
  for each row execute function touch_account_updated();

-- 公開カレンダー
drop trigger if exists trg_touch_account on cal_public;
create trigger trg_touch_account
  after insert or update or delete on cal_public
  for each row execute function touch_account_updated();

-- 復旧設定の同期は公開コンテンツではないので updated_at を動かさない
-- （既存定義から `updated_at = now()` のみ除去、他は不変）。
create or replace function sync_recovery_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare uid uuid := auth.uid();
declare email_ok boolean := false;
declare contacts jsonb;
begin
  if uid is null then raise exception 'auth'; end if;
  select
    email_confirmed_at is not null
      and coalesce(email, '') <> ''
      and email not like '%@passkey.via-mi.invalid'
      and email not like '%@id.via-mi.com'
  into email_ok from auth.users where id = uid;
  update accounts set recovery_verified = email_ok,
    recovery_kind = case when email_ok then 'email' else null end
    where auth_user_id = uid;
  contacts := coalesce(_masked_recovery_contacts(uid), jsonb_build_object('recovery_email_masked', null));
  return jsonb_build_object(
    'recovery_verified', email_ok,
    'recovery_kind', case when email_ok then 'email' else null end
  ) || contacts;
end
$$;
