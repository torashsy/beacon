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

## 3. Storage バケット作成（画像用）

1. 左メニュー **Storage** → **New bucket**
2. Name: `avatars` / **Public bucket をON** → 作成
3. パス規約: `avatars/{handle}/av.jpg`（アイコン）, `avatars/{handle}/bn.jpg`（ヘッダー）
   - アップロードは匿名（anon）から行うため、公開バケットの
     **INSERT/UPDATE ポリシー**を anon に許可する必要がある。
     Storage → avatars → Policies で以下を追加（本人パスの制限は
     アプリ側の RPC 認証に委ねる簡易版。厳密化は後述）:
     - `insert`: `bucket_id = 'avatars'`（roles: anon, authenticated）
     - `update`: `bucket_id = 'avatars'`（roles: anon, authenticated）
     - `select`: 公開バケットなので自動で読める

   > より厳密にするなら、画像アップロードも RPC 化して service_role で
   > 書く方式に寄せる。まずは上記の簡易版で動作確認 → 後で締める。

## 4. 環境変数

Supabase の **Settings → API** から 2 値をコピーし `.env.local` に:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`service_role` キーは**使わない**（このアプリは anon + RPC 検証で完結）。

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
