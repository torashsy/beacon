-- ============================================================
-- Beacon セキュリティ強化マイグレーション（既存プロジェクトに適用）
-- SQL Editor に貼って Run。冪等（何度流してもOK）。
--
-- 目的: anon キー（公開）による全ユーザー列挙（スクレイピング）を止める。
--   これまで profiles/channels/cal_public に anon の直接 select を許可していたため、
--   `select * from profiles` で全ユーザーを一括取得できてしまっていた。
--   直接 select を revoke し、公開ページはハンドル指定の get_public_page() 経由のみにする。
-- ============================================================

-- 1) 直接 select 権限を剥奪（これで /rest/v1/profiles?select=* が permission denied になる）
revoke select on profiles   from anon, authenticated;
revoke select on channels   from anon, authenticated;
revoke select on cal_public from anon, authenticated;

-- 2) 公開ページ1件取得のRPC（security definer なので上記 revoke の影響を受けない）
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

grant execute on function get_public_page(text) to anon;
