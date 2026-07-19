# 公開運用手順

## 自動監視

- GitHub Actions の `Production smoke` が6時間ごとにトップ、ヘルスチェック、問い合わせ画面、CSPを確認する。
- 失敗時はActionsの失敗通知を確認し、Vercelの直近デプロイとSupabaseの稼働状況を確認する。
- `/api/health` はアプリ自体の応答確認であり、DB疎通までは保証しない。
- ID検索はアプリ側でIPごとに10分20回へ制限する。サーバーレス環境ではインスタンス間で
  カウントが共有されないため、異常アクセスが見えたらVercel Firewall側にもレート制限を追加する。

## 公開前チェック

- `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
- 本番反映後に `npm run smoke:production`
- Supabaseの管理用一時トークンは作業後に必ず失効させる。
- 正規URLは `https://via-mi.com`。`www.via-mi.com` とVercel既定ドメインは正規URLへ転送する。
- 画像アップロード用Edge Functionの `BEACON_ALLOWED_ORIGINS` は
  `https://via-mi.com,https://www.via-mi.com` を維持する。

## 毎日の問い合わせ・通報確認

Supabase Dashboard の Table Editor で `contact_submissions` を開き、`status = new`
を確認する。確認中は `reviewing`、対応後は `resolved`、対象外は `rejected` にする。
返信先メールが入力されている場合のみ、運営者の正式なメールアドレスから返信する。

`category = privacy` は優先して確認する。対象IDと請求内容を特定し、パスキーでのログイン、
確認済み復旧メール等により本人確認を行う。必要以上の本人確認資料は取得しない。
開示等は原則として電磁的方法で行い、判断・対応・回答日を記録する。

## 問題アカウントを直ちに非公開にする

Supabase SQL Editor で次を実行する。非公開化と同時に全セッションが失効する。

```sql
select set_account_suspension('対象ID', true, '通報番号・理由');
```

確認後に復旧する場合:

```sql
select set_account_suspension('対象ID', false, '確認完了');
```

重大な違反でデータを削除する場合は、先に通報内容と対応理由を記録したうえで実行する。
Supabase Storage の `avatars/対象ID/` 以下をすべて削除してから、次を実行する。

```sql
delete from accounts where handle = lower('対象ID');
```

## 週次確認

- Vercel の最新Production Deploymentが成功していること
- GitHub Actionsの `main` CIが成功していること
- Dependabotの脆弱性アラートと更新PRを確認し、CI成功後に取り込むこと
- SupabaseのDatabase/Storage使用量とエラーログに急増がないこと
- Supabase Edge Functions の `delete-account` と `create-avatar-upload` に継続的なエラーがないこと

## 個人データの漏えい等が疑われる場合

1. 影響拡大を止め、発覚日時・対象機能・対象データ・件数・初動対応を記録する。
2. 対象者への連絡、サービス内での公表、個人情報保護委員会への報告が必要かを確認する。
3. 報告対象の場合は、原則として発覚から3〜5日以内に速報し、30日以内
   （不正目的のおそれがある場合は60日以内）に確報する。
4. 原因を修正し、再発防止策と対応経緯を記録する。

判断時は個人情報保護委員会の
[漏えい等の対応とお役立ち資料](https://www.ppc.go.jp/personalinfo/legal/leakAction/)
を確認する。

## 緊急停止

大量不正利用時は、VercelでProduction Deploymentを一時保護し、Supabaseのanon向け
RPC権限を必要最小限にrevokeする。復旧前に原因・影響範囲・対象データを記録する。
