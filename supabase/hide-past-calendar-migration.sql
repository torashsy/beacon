-- 公開ページのカレンダーから、過去日の予定を自動で除外する。
-- 既存の記録は削除せず（cal_public のデータはそのまま）、公開表示のときだけ
-- 当日以降（d >= current_date）に絞る。所有者本人の編集画面（get_private_cal）は
-- これまで通り全件返し、過去の予定も管理・削除できるようにする。
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
        from cal_public cp where cp.handle = lower(p_handle) and cp.d >= current_date), '[]'::jsonb)
    )
  end;
$$;
revoke all on function get_public_page(text) from public, authenticated;
grant execute on function get_public_page(text) to anon;
