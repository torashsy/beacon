-- ============================================================
-- Beacon: 退会後にStorageへ残る画像（アバター/バナー）の定期削除。
-- Management API 経由で適用（SQL Editor でも可・冪等）。
--
-- 設計方針:
--   - service_role キーはアプリのコード・環境変数には一切登場しない。
--     Supabase Vault（DB内の暗号化ストア）にのみ保存し、
--     security definer 関数からだけ読み出せる。
--   - 実行はすべて Supabase 内部（pg_cron + pg_net）で完結する。
--     外部のスケジューラ・サーバーレス関数・Vercel環境変数は不要。
--   - accounts に存在しないハンドルのフォルダのみ削除する
--     （誤って現役アカウントの画像を消さないよう、突き合わせてから消す）。
--   - 失敗しても cron ジョブ全体は落とさず、必ずログに残す。
-- ============================================================

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
