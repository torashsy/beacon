-- フォロー更新チェックの一括化用。指定ハンドル群の accounts.updated_at をまとめて返す。
-- クライアントは各スナップショットの pageUpdated と比較し、変化のない相手は
-- get_public_page の本体取得を省略できる（フォロー数が多いほどDB読み取りを削減）。
-- 返すのは公開情報の更新時刻のみ。停止(suspended)アカウントは除外し、入力は
-- ハンドル形式に一致するものだけ・最大500件に制限する（列挙防止・有界化）。

create or replace function get_pages_updated(p_handles text[])
returns table(handle text, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select a.handle, a.updated_at
  from accounts a
  where a.handle in (
      select distinct lower(h)
      from unnest(coalesce(p_handles, '{}'::text[])) as h
      where lower(h) ~ '^[a-z0-9_]{1,30}$'
      limit 500
    )
    and not exists (
      select 1 from account_moderation m where m.handle = a.handle and m.suspended
    );
$$;

revoke all on function get_pages_updated(text[]) from public, authenticated;
grant execute on function get_pages_updated(text[]) to anon;
