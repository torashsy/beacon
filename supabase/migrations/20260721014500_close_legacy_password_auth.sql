-- 現行UIはパスキー専用（AuthView）で、旧パスワード方式のRPCはクライアントから
-- 一切呼ばれていない。しかしこれらが anon に grant されたままだと、RPCを直接叩いて
--   - create_account: パスキーを経由せずパスワード式アカウントを作成／ハンドル占有
--   - create_session: そのパスワードでセッショントークンを取得しページを操作
-- という裏口が開いた状態になる。旧パスワードユーザーのパスキー移行は
-- authorize_passkey_signup / finalize_passkey_account（service_role、Edge Function経由で
-- _check_pass を内部利用）で行われ、これらの anon grant には依存しないため、まとめて閉じる。
-- 関数定義自体は残し、anon からの実行権限だけを剥奪する（冪等）。

revoke execute on function create_account(text,text) from anon;
revoke execute on function verify_login(text,text) from anon;
revoke execute on function reset_pass(text,text,text) from anon;
revoke execute on function create_session(text,text) from anon;
revoke execute on function reissue_recovery(text,text) from anon;
