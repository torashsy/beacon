-- 本番ハードニング二点。
--
-- (1) 稼働中の SECURITY DEFINER 関数のうち search_path 未固定のものを固定する。
--     未固定だと呼び出し時の search_path 次第で、無修飾の関数/テーブル参照が
--     意図しないスキーマ（pg_temp 等）に解決される余地が残る（Supabase advisor:
--     function_search_path_mutable / WARN）。
--     これらは public のテーブルと extensions スキーマの pgcrypto（digest/encode/
--     crypt）を無修飾で参照するため、両方を解決できる `public, extensions` に固定する。
--     `pg_temp` と `"$user"` を除外することで一時テーブルによる乗っ取り経路を塞ぐ。
--     ここに挙げた 8 関数は現行フローで実際に呼ばれている（_check_pass は
--     セッション/トークン検証の中核で、多数の定義関数から内部利用される）。
--
-- (2) 旧パスワード方式の入口 RPC を削除する。20260721014500 で anon から revoke 済み、
--     現行UI（パスキー専用）からもDB内の他関数からも参照されていないことを確認した。
--     関数定義だけが死蔵されていた状態を解消する。CASCADE は付けない（万一の依存が
--     あれば失敗して全体がロールバックされる方が安全）。

-- (1) search_path 固定
alter function _check_pass(text, text) set search_path = public, extensions;
alter function authorize_avatar_upload(text, text) set search_path = public, extensions;
alter function delete_session(text, text) set search_path = public, extensions;
alter function get_clicks(text, text) set search_path = public, extensions;
alter function get_my_follows(text, text) set search_path = public, extensions;
alter function revoke_other_sessions(text, text) set search_path = public, extensions;
alter function save_cal(text, text, date, text) set search_path = public, extensions;
alter function save_my_follows(text, text, jsonb) set search_path = public, extensions;

-- (2) 旧パスワード RPC の削除
drop function if exists create_account(text, text);
drop function if exists create_session(text, text);
drop function if exists reissue_recovery(text, text);
drop function if exists reset_pass(text, text, text);
drop function if exists verify_login(text, text);
