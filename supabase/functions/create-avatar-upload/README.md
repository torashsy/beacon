# create-avatar-upload

セッショントークン（またはログイン直後のパスコード）を `authorize_avatar_upload`
RPCで検証し、`avatars`バケットの1パスだけに使える署名付きアップロードトークンを返す。

デプロイ時に次のSecretを設定する。

```text
BEACON_ALLOWED_ORIGINS=https://本番ドメイン,https://プレビュードメイン
```

`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`はEdge Functionsの組み込み環境変数を使う。
