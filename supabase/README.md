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

## 今後の変更（自動適用）

`supabase/migrations/` にファイルを追加して `main` にマージすると、
`.github/workflows/supabase-migrate.yml` が自動で本番に適用する
（`supabase db push`。認証は既存の `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_ID`）。
SQL Editorへ手動で貼る必要はない。

1. `supabase migration new <name>` 相当のファイル名（`YYYYMMDDHHMMSS_name.sql`）で
   `supabase/migrations/` に追加する。
2. SQLは可能な限り冪等にする（`if exists` / `if not exists`）。
3. `main` にマージすると自動適用される。適用後にこのREADMEの一覧を更新する。
4. Edge Function変更時は対象名を指定して `npx supabase functions deploy <name>` を実行する（未自動化）。

ルート直下の `*-migration.sql`（このディレクトリ直下、`migrations/` 配下ではない方）は
自動適用の仕組み以前に手動適用してきた履歴で、`.github/workflows/supabase-baseline.yml`
（一度だけ実行）が本番の現在のスキーマを `supabase/migrations/` の最初の1本として
取り込み済み。今後は参照用に残すのみ。

アクセストークン、DBパスワード、service role keyはリポジトリへ保存しない。
