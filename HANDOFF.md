# my-IDeal 実装引き継ぎ

このリポジトリは **下準備済みの雛形** です（元の3ファイル移行パッケージから発展）。
Claude Code を**このリポジトリのルート**で開き、下のプロンプトを貼れば実装が進みます。

- 設計図 兼 仕様書: `reference/beacon.html`（ブラウザ内で全機能が動く完成デモ）
- 本番スキーマ: `supabase/schema.sql`（そのまま Supabase で Run）
- セットアップ: `SETUP.md`（Supabase / Storage / 環境変数 / Vercel）
- 雛形の完成/未完了マップ: `README.md`

まず `SETUP.md` の手順1〜4で Supabase を用意してから、下のプロンプトを貼ってください。

---

## Claude Code に貼るプロンプト（ここからコピー）

```
このリポジトリは my-IDeal の下準備済み雛形です。reference/beacon.html が
「完成デザイン兼仕様書」（全機能が動くブラウザデモ）、supabase/schema.sql が
本番スキーマです。これを Next.js (App Router) + Supabase の本番アプリとして
完成させてください。

## すでに用意済み（再実装しない・これを使う）
- lib/beacon/rpc.ts   … schema.sql の全 RPC を型付きで呼ぶラッパー
- lib/beacon/storage.ts … 画像を canvas 縮小して 'avatars' バケットへ upload
- lib/beacon/types.ts  … ドメイン型（Channel の説明カラムは descr、
                          save_channels の JSON キーは "desc"。差異は
                          toChannelPayload が吸収済み。勝手に変えないこと）
- lib/supabase/{client,server}.ts … anon キーのみの Supabase クライアント
- app/[handle]/page.tsx … 公開ページ /@{handle} の最小実装（OGP付き）
- app/page.tsx … トップのスタブ

## 忠実に再現するもの（reference/beacon.html の通り）
- 水色系配色、X(Twitter)準拠のUI（バナー+重なりアイコン+ピルボタン、
  プロフィール編集はXと同じ「✕/保存バー+タップで画像変更」形式）
  → 配色トークンは app/globals.css に移植済み。beacon.html の <style> を各
    コンポーネントへ展開すること。
- 画面: 認証(作成/ログイン/復旧コード再設定) / プロフィール(リンク・カレンダーの
  下線タブ) / 公開ページ / フォロー中一覧 / 使い方
- 機能: 複数リンク(種類/表示名/説明/並び替え/有効・停止)、カレンダーメモ
  (メモ単位で公開/非公開)、復旧コードの再表示、プレビュー、公開ページ末尾の
  「あなたも無料で作る」導線

## デモから本番へ置き換えるもの
1. 認証: ブラウザ内ハッシュ照合をやめ、lib/beacon/rpc.ts の
   createAccount / verifyLogin / resetPass でサーバー検証する。
   書込RPC(updateProfile/saveChannels/saveCal/getPrivateCal)は毎回パスコードを渡す。
2. セッション方式は【最初に1案を提案して合意を取ってから実装】。
   candidate: パスコードは localStorage に平文で置かず、(a) ログイン後は
   メモリ保持し書込のたびに使う＋リロード時は再入力、または (b) Web Crypto で
   端末鍵封印。まず (a) を推奨として提案し、私の合意後に実装。
3. 画像: Base64をやめ storage.ts 経由で 'avatars' バケットへ
   ({handle}/av.jpg, {handle}/bn.jpg)。SETUP.md のバケット/ポリシー前提。
4. 公開ページは app/[handle]/page.tsx を土台に beacon.html の renderPublicFor を
   移植（リンク一覧・公開カレンダー・OGP・末尾導線）。/@{handle} で誰でも閲覧可能。
5. フォローリストはサーバーに保存しない（端末 localStorage）。beacon.html と同じ挙動。

## 絶対に実装してはいけないもの（法的制約）
- ユーザーを横断検索・一覧・レコメンドする機能(API含む)。
  出会い系サイト規制法の「異性紹介事業」該当を避けるための設計上の一線。
- 決済機能。金銭は扱わない。「支援」リンクは外部URLを貼るだけ。

## 進め方（この順で。各ステップ後に一度止まって確認を取る）
1. SETUP.md の手順が私の環境で通ることを確認（Supabase接続の疎通）。
2. 認証画面 → セッション方式の合意 → プロフィール編集（リンク/カレンダー）。
3. 公開ページの見た目を beacon.html に寄せる。
4. 通しで動作確認（作成→ログイン→編集→/@handle表示→退会）。
5. Vercel デプロイ手順まで案内。
```

（ここまでコピー）

---

## 本番で必ず守る2点

- **認証はサーバー検証**: デモの「ブラウザ内ハッシュ照合」は本番では無意味。
  schema.sql の RPC が本物の検証（bcrypt + 5回失敗で15分ロック）を行う。
- **検索・一覧機能は永久に作らない**: 発信者を探せる導線を作った瞬間に
  出会い系規制の対象になる。ID は本人が配るのみ。
