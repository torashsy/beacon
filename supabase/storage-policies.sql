-- ============================================================
-- Beacon: avatars バケットの anon 書込ポリシー + 濫用防止設定
-- 前提: 先に Supabase ダッシュボード（Storage → New bucket）で
--       'avatars' を public バケットとして作成しておくこと。
-- これを SQL Editor で Run する（schema.sql の handle_exists 関数が必要。
-- 先に schema.sql を実行しておくこと）。
--
--   - insert を anon に許可。ただし「実在するハンドルのフォルダ」への
--     アップロードのみ許可し、任意パスへの無制限アップロードを防ぐ
--   - upsert は使わない設計（storage.ts が毎回ユニークなファイル名で INSERT する）
--     ため update ポリシーは付与しない。未使用の書込権限を残さない
--   - select は public バケットのため自動で読める
--   - バケットにファイルサイズ上限(5MB)・MIME制限(画像のみ)を設定し、
--     大容量ファイルや任意コンテンツのホスティングに使われるのを防ぐ
--
-- もし "must be owner of table objects" 等の権限エラーが出る場合は、
-- ダッシュボードの Storage → avatars → Policies から同等のポリシーを作成する
-- （operation: INSERT, roles: anon, expression:
--   bucket_id = 'avatars' and handle_exists((storage.foldername(name))[1])）。
-- ============================================================

update storage.buckets
  set file_size_limit = 5242880, -- 5MB
      allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'avatars';

drop policy if exists avatars_anon_insert on storage.objects;
create policy avatars_anon_insert on storage.objects
  for insert to anon
  with check (
    bucket_id = 'avatars'
    and handle_exists((storage.foldername(name))[1])
  );

drop policy if exists avatars_anon_update on storage.objects;
