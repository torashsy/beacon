# Beacon セットアップ手順

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

この関数がBeaconのセッショントークンを検証し、1回限りの署名付きアップロードURLを発行する。
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

> 疎通だけ手早く確認したいときは `node scripts/conn-test.mjs` を実行。
> `.env.local` を使って全RPC・RLS・Storage をランダムなIDで検証し、最後に
> 退会して後片付けします（手順2・3が済んでいれば「全項目 OK」）。

---

## 6. Vercel デプロイ

1. https://vercel.com に GitHub でサインイン → **Add New → Project**
2. `torashsy/beacon` を **Import**
3. Framework は Next.js 自動検出。**Environment Variables** に手順4の 2 値を設定
   （Production / Preview 両方）
4. **Deploy**
5. 発行された URL で `/@{handle}` が開けば公開成功
   - 独自ドメインは Vercel の **Settings → Domains** で後付け可能

### デプロイ後に締める

- Supabase **Authentication → URL Configuration** は本アプリでは不使用（RPC認証のため）
- Storage ポリシーを厳密版へ（手順3の注記）
- 本番URLを OGP の絶対URL計算に使う場合は `NEXT_PUBLIC_SITE_URL` を追加して
  `generateMetadata` で参照する
