# via-mi セットアップ手順

雛形（Next.js App Router + Supabase）を動かすまでの手順。所要 15〜20 分。

## 0. ローカル起動（先に動かして確認）

```bash
npm install
cp .env.local.example .env.local   # まだ値は空でOK
npm run dev
```

`http://localhost:3000` が開けばOK（この時点では Supabase 未接続のスタブ表示）。

---

## 1. Supabase プロジェクト作成

1. https://supabase.com にサインアップ → **New project**
2. Name: `beacon` / Database Password: 任意（控える）/ Region: `Northeast Asia (Tokyo)` 推奨
3. 作成完了まで 2〜3 分待つ

## 2. スキーマを流す

1. 左メニュー **SQL Editor** → **New query**
2. リポジトリの `supabase/schema.sql` の中身を全部貼る → **Run**
3. `Success. No rows returned` が出ればOK
   - RPC（`create_account` / `verify_login` など）とテーブル、RLS が作られる

既存環境の更新手順と適用履歴は `supabase/README.md` を参照する。

## 3. Storage バケット作成（画像用）

storage スキーマは `supabase_storage_admin` 所有で、SQL Editor から直接
バケット insert / ポリシー作成すると権限エラーになる環境がある。そこで2段で行う:

**3-1. バケット作成（ダッシュボード）**

1. 左メニュー **Storage** → **New bucket**
2. Name: `avatars` / **Public bucket をON** → 作成
   - パス規約: `avatars/{handle}/av.jpg`（アイコン）, `avatars/{handle}/bn.jpg`（ヘッダー）

**3-2. Storage制限（SQL Editor）**

`supabase/storage-policies.sql` の中身を **SQL Editor** に貼って **Run**。
これでブラウザからの匿名 `insert`/`update` は拒否される（`select` は publicバケットなので可能）。

**3-3. 認証付きアップロード関数**

1. `supabase/authenticated-storage-migration.sql` を SQL Editor で実行
2. `supabase/functions/create-avatar-upload/index.ts` をEdge Functionとしてデプロイ
3. Function Secret `BEACON_ALLOWED_ORIGINS` に本番URLを設定（複数はカンマ区切り）

この関数がvia-miのセッショントークンを検証し、1回限りの署名付きアップロードURLを発行する。
アカウントごとの上限は毎時30回。

> `must be owner of table objects` 等が出る場合は、ダッシュボードの
> Storage → `avatars` → **Policies** で `avatars_anon_insert` と
> `avatars_anon_update` が存在しないことを確認する。匿名書込ポリシーは作成しない。

## 4. 環境変数

Supabase の **Settings → API** から 2 値をコピーし `.env.local` に:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`secret` / `service_role` キーは**使わない**（このアプリは publishable + RPC 検証で完結）。

再度 `npm run dev` → 認証やプロフィール実装を進められる状態になる。

## 5. 動作確認の順序（実装を進めるとき）

1. トップ `/` で「IDを作成」→ 表示された**復旧コードを必ず控える**
   （作成時のみ表示。以降は再表示されない）
2. ログアウト → 同じIDで再ログイン（パスコード再入力）
3. プロフィール編集（名前/自己紹介/アイコン画像）・リンク追加/並替/停止・
   カレンダーメモ（公開/非公開）を保存
4. `/@{handle}` を開いて公開表示・OGP を確認
5. 「退会（アカウントを削除）」で削除できることを確認

> 疎通確認は本番の `/api/health`（`get_public_page` の往復）と e2e（`npm run test:e2e`）で行う。
> `scripts/conn-test.mjs` は旧パスワード方式RPC前提の通し検証で、パスキー専用化に伴い
> それらを anon から revoke したため現在は動かない（参照用に残置）。

---

## 6. Vercel デプロイ

1. https://vercel.com に GitHub でサインイン → **Add New → Project**
2. `torashsy/beacon` を **Import**
3. Framework は Next.js 自動検出。**Environment Variables** に手順4の 2 値を設定
   （Production / Preview 両方）
4. **Deploy**
5. 発行された URL で `/@{handle}` が開けば公開成功
   - 独自ドメインは Vercel の **Settings → Domains** で後付け可能

### アカウント復旧メール（Authentication → Email Templates → Magic Link）

別端末での復旧は「メールの6桁コードをアプリに入力する」方式（`verifyOtp`）。
ホーム画面版(PWA)ではメール内リンクが別ブラウザで開き認証が引き継がれないため、
コード方式を基本にしている。テンプレートを日本語化し、**本文にコード `{{ .Token }}` を
必ず含める**こと（リンクは同一ブラウザ用のフォールバック）。

```
件名: via-mi 確認コード
本文:
<h2>via-mi ログイン確認</h2>
<p>アプリに次の6桁のコードを入力してください。</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px;">{{ .Token }}</p>
<p>または <a href="{{ .ConfirmationURL }}">こちらのリンク</a> からも確認できます。</p>
<p>1時間で無効になります。心当たりがなければ無視してください。</p>
```

### 送信元メール（Authentication → SMTP Settings）

Supabase標準のメール送信は時間あたりの送信数が少なく、本番の復旧メールには
心もとない。[Resend](https://resend.com) をSMTPとして使う。

`onboarding@resend.dev`（ドメイン未認証の共有アドレス）はResendアカウント登録時の
メールアドレス宛にしか送信できない仕様のため、**本番では使わない**。via-mi.comの
サブドメイン（例: `notify.via-mi.com`）をResendでドメイン認証し、そのドメインの
アドレスを送信元にする。

1. resend.com に登録 → **Domains** でサブドメインを追加
2. 発行されるDNSレコード（DKIM用TXT、SPF用MX/TXT）をDNS管理画面に追加し、Resend側でVerify
3. **API Keys** でキーを1つ作成
4. Supabase → **Authentication → SMTP Settings** に入力:

   | 項目 | 値 |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | 作成したAPIキー（`re_...`） |
   | Sender email | `no-reply@notify.via-mi.com`（認証したドメイン配下） |
   | Sender name | `via-mi` |

### デプロイ後に締める

- Supabase **Authentication → URL Configuration** の Redirect URLs に本番URL（`https://via-mi.com/`）を許可（復旧リンクのフォールバック用）
- 上記のメールテンプレート（Magic Link）を日本語化し `{{ .Token }}` を含める
- Storage ポリシーを厳密版へ（手順3の注記）
- 本番URLを OGP の絶対URL計算に使う場合は `NEXT_PUBLIC_SITE_URL` を追加して
  `generateMetadata` で参照する
