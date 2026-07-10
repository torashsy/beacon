# Beacon

X(Twitter)風のUIで、**複数リンク**と**カレンダーメモ**をひとつの公開ページ
（`/@{handle}`）にまとめる発信ツール。Next.js (App Router) + Supabase。

## この雛形の状態

実装の**下準備**まで済んでいます。UI/画面ロジックは `reference/beacon.html`
（動くデザイン兼仕様書）を移植して完成させます。

| 場所 | 中身 | 状態 |
|---|---|---|
| `supabase/schema.sql` | 本番スキーマ（パスコード認証・試行制限・退会） | ✅ 完成（そのまま流す） |
| `lib/beacon/rpc.ts` | スキーマの RPC を型付きで呼ぶラッパー | ✅ 完成 |
| `lib/beacon/storage.ts` | 画像リサイズ + Storage アップロード | ✅ 完成 |
| `lib/beacon/types.ts` | ドメイン型 | ✅ 完成 |
| `lib/supabase/{client,server}.ts` | Supabase クライアント | ✅ 完成 |
| `app/page.tsx` | 認証 / プロフィール編集 | 🟡 スタブ（要移植） |
| `app/[handle]/page.tsx` | 公開ページ + OGP | 🟡 最小実装（要移植） |
| `reference/beacon.html` | 完成デザイン兼仕様書 | 📖 参照専用 |

## はじめかた

セットアップは **[SETUP.md](./SETUP.md)** を参照。実装の進め方は
**[HANDOFF.md](./HANDOFF.md)** のプロンプトを使う。

```bash
npm install
cp .env.local.example .env.local   # Supabase の URL と anon キーを入れる
npm run dev
```

## 設計上の絶対制約（法的）

- **横断検索・一覧・レコメンドを作らない**（API含む）。発信者を探せる導線を
  作った瞬間に出会い系サイト規制法の「異性紹介事業」該当リスク。ID は本人が配るのみ。
- **決済機能を作らない**。「支援」は外部URLを貼るだけ。

## セキュリティの要点

- 認証は**サーバー側 RPC**（bcrypt + 5回失敗で15分ロック）。ブラウザ内照合はしない。
- 書き込み RPC は毎回パスコードを要求。`service_role` キーは使わない。
- 復旧コードは作成時に一度だけ返る平文。サーバーに平文は残さない。
