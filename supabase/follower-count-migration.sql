-- フォロワーの個人一覧は公開せず、指定ハンドルの合計人数だけを返す。
create or replace function get_follower_count(p_handle text)
returns bigint language sql security definer stable as $$
  select case
    when lower(p_handle) !~ '^[a-z0-9_]{3,20}$' then 0
    else (select count(*) from follows_server where target = lower(p_handle))
  end;
$$;

revoke all on function get_follower_count(text) from public, authenticated;
grant execute on function get_follower_count(text) to anon;
