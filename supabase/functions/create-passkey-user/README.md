# create-passkey-user

IDだけでパスキー登録を開始するため、確認済みの内部Authユーザーと一度限りの
bootstrap tokenを発行する。利用者が入力するメールアドレスではない。

Dashboardで `verify_jwt = false` とし、`BEACON_ALLOWED_ORIGINS` に
`https://via-mi.com` を設定する。`SUPABASE_URL` と
`SUPABASE_SERVICE_ROLE_KEY` はSupabaseが自動提供する。

