# via-mi バックアップ・復旧手順

## 自動バックアップ

- GitHub Actions の `Encrypted production backup` が毎日 03:30（日本時間）に実行される。
- `public` スキーマの構造・データ、DBロール、Supabase Storage の `avatars` を取得する。
- バックアップは公開証明書で暗号化してからGitHub Actionsへ保存し、30日後に自動削除する。
- GitHub Actions上に平文のDB・画像バックアップを残さない。
- 目標復旧時点（RPO）は24時間以内、目標復旧時間（RTO）は4時間以内とする。

Supabase AuthはSupabase管理領域であり、このエクスポートだけでは完全復旧できない。料金プランをPro以上にした場合は、Supabaseの日次バックアップまたはPITRも併用する。

## 復号鍵

復号に必要な秘密鍵はリポジトリやGitHub Secretsに置かない。このPCの次の場所に保存している。

`C:\Users\峻矢\Documents\via-mi-backup-recovery\via-mi-backup-private-key.pem`

PC故障に備え、このファイルをパスワード管理アプリなど別の安全な場所にも1部保管する。メール、公開クラウドフォルダ、リポジトリには置かない。

## 復旧手順

1. GitHub Actions の `Encrypted production backup` から復旧対象のartifactをダウンロードする。
2. ZIPを展開し、暗号化ファイルと秘密鍵を同じ作業用フォルダへ置く。
3. 次のコマンドで復号・展開する。

```powershell
$openssl = "$env:USERPROFILE\scoop\apps\git\current\mingw64\bin\openssl.exe"
& $openssl cms -decrypt -binary -inform DER `
  -in .\via-mi-backup-YYYYMMDDTHHMMSSZ.tar.gz.cms `
  -recip .\backup-recipient.pem `
  -inkey "$env:USERPROFILE\Documents\via-mi-backup-recovery\via-mi-backup-private-key.pem" `
  -out .\via-mi-backup.tar.gz
tar -xzf .\via-mi-backup.tar.gz
```

`backup-recipient.pem` はリポジトリの `.github/backup-recipient.pem` を使用する。

4. `backup/SHA256SUMS` と実ファイルのSHA-256を照合する。
5. 新しいSupabaseプロジェクトを用意し、まず `roles.sql`、次に `schema.sql`、最後に `data.sql` の順で復元する。
6. `backup/storage/avatars` のファイルをStorageの `avatars` バケットへ戻す。
7. via-miの環境変数を新プロジェクトへ切り替え、`/api/health`、ログイン、公開プロフィール、画像表示を確認する。

復旧を本番障害時に初めて試さない。少なくとも3か月ごとに、一時プロジェクトを使った復旧訓練を行う。
