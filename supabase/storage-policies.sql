-- ============================================================
-- Beacon: avatars バケットの anon 書込ポリシー
-- 前提: 先に Supabase ダッシュボード（Storage → New bucket）で
--       'avatars' を public バケットとして作成しておくこと。
-- これを SQL Editor で Run する。
--   - insert/update を anon に許可（本人パスの制限はアプリ側 RPC 認証に委ねる簡易版）
--   - select は public バケットのため自動で読める
-- もし "must be owner of table objects" 等の権限エラーが出る場合は、
-- ダッシュボードの Storage → avatars → Policies から同等のポリシーを作成する
-- （operation: INSERT / UPDATE, roles: anon, expression: bucket_id = 'avatars'）。
-- ============================================================

drop policy if exists avatars_anon_insert on storage.objects;
create policy avatars_anon_insert on storage.objects
  for insert to anon with check (bucket_id = 'avatars');

drop policy if exists avatars_anon_update on storage.objects;
create policy avatars_anon_update on storage.objects
  for update to anon using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
