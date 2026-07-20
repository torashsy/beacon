# Supabase変更管理

## 正本

- 新規環境は `schema.sql` を最初に実行し、続けて `passkey-auth-migration.sql` を実行する。
- Storageバケットの制限は `storage-policies.sql` を実行する。
- Edge Functionは `functions/create-avatar-upload` と `functions/create-passkey-user` をデプロイする。
- AuthenticationでPasskeysを有効化し、EmailのSecure email changeを無効化する。
- ルート直下の `*-migration.sql` は、既存環境へ段階適用してきた履歴。新規環境へ
  `schema.sql` と重ねて全実行しない。

## 現行 via-mi プロジェクト

2026-07-20時点で以下を適用・検証済み。

- `remove-legacy-update-profile.sql`
- `authenticated-storage-migration.sql`
- `auth-hardening-migration.sql`
- `contact-form-migration.sql`
- `follower-count-migration.sql`
- `public-launch-migration.sql`
- `profile-color-migration.sql`
- `auth-finalization-migration.sql`
- `remove-unused-link-thumbnails.sql`
- `passkey-auth-migration.sql`
- `passkey-label-migration.sql`
- `recovery-contact-migration.sql`
- `email-only-recovery-migration.sql`
- `push-notifications-migration.sql`
- `hide-past-calendar-migration.sql`
- `abolish-private-calendar-migration.sql`
- `create-avatar-upload` Edge Function
- `create-passkey-user` Edge Function（Verify JWT off）
- `send-follow-update` Edge Function（Verify JWT off、VAPID秘密鍵を使用）

検証は `node scripts/conn-test.mjs` を実行する。テスト用アカウントは最後に削除される。

## 今後の変更

1. 既存SQLを直接編集するだけでなく、目的単位の `YYYYMMDDHHMM_name.sql` を追加する。
2. SQLは可能な限り冪等にする（`if exists` / `if not exists`）。
3. ステージングへ適用して `conn-test.mjs` を通す。
4. 本番適用後にこのREADMEの適用済み一覧を更新する。
5. Edge Function変更時は対象名を指定して `npx supabase functions deploy <name>` を実行する。

アクセストークン、DBパスワード、service role keyはリポジトリへ保存しない。
