-- フォロー一覧の「更新時刻」を、フォローした時刻ではなく相手が実際にページを
-- 更新した時刻で表示できるようにする。profiles には汎用の更新時刻が無く、
-- accounts.updated_at がプロフィール/リンク/カレンダーの各更新RPCで now() に
-- 更新される正本なので、それを get_public_page が返す profile に含める。
-- 既存の定義（当日以降のカレンダー・停止アカウント非表示）はそのまま保つ。

create or replace function get_public_page(p_handle text)
returns jsonb language sql security definer stable set search_path = public as $$
  select case
    when not exists (select 1 from profiles where handle = lower(p_handle))
      or exists (select 1 from account_moderation where handle=lower(p_handle) and suspended)
      then null
    else jsonb_build_object(
      'profile', (
        (select to_jsonb(p) from profiles p where p.handle = lower(p_handle))
        || jsonb_build_object(
          'updated_at',
          (select a.updated_at from accounts a where a.handle = lower(p_handle))
        )
      ),
      'channels', coalesce((select jsonb_agg(to_jsonb(c) order by c.position, c.id)
        from channels c where c.handle = lower(p_handle)), '[]'::jsonb),
      'cal', coalesce((select jsonb_agg(jsonb_build_object('d', cp.d, 'memo', cp.memo) order by cp.d)
        from cal_public cp where cp.handle = lower(p_handle) and cp.d >= current_date), '[]'::jsonb)
    )
  end;
$$;

notify pgrst, 'reload schema';
