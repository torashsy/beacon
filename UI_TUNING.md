# via-mi UI調整ガイド

## UI調整パネルを開く

PowerShellで開発サーバーを起動します。

```powershell
cd "C:\Users\峻矢\Documents\Codex\2026-07-12\cl\beacon"
npm run dev
```

`http://localhost:3000` を開き、画面右上の「UI調整」を押します。
このボタンは開発環境にだけ表示され、本番の `via-mi.com` には表示されません。

## パネルで調整できるもの

- テーマとライト／ダークモード
- 画面背景、カード背景、本文、補助文字、枠線
- ボタン、丸数字、リンク、アイコン、QRの色
- カードの角丸、画面の最大幅、左右余白
- 任意のセレクターを指定する追加CSS

調整内容はブラウザの `localStorage` に一時保存されます。コードは自動変更されません。
決まったら「CSSをコピー」を押し、`app/globals.css` の該当テーマへ反映します。

## 色の役割

| 変数 | 用途 |
| --- | --- |
| `--page` | 画面背景 |
| `--surface` | カード背景 |
| `--text` | 見出し・本文 |
| `--muted` | 説明・補助文字 |
| `--border` | 枠線 |
| `--em` | ボタン・丸数字 |
| `--emd` | リンク・アイコン・QR |
| `--eml` | 淡い強調背景 |
| `--on-em` | 強調色の上の文字 |

## 文字列の編集場所

| 画面 | ファイル |
| --- | --- |
| ログイン・ID作成 | `components/beacon/AuthView.tsx` |
| 自分・公開プロフィール | `components/beacon/ProfileView.tsx` |
| プロフィール編集 | `components/beacon/ProfileEdit.tsx` |
| フォロー一覧・検索 | `components/beacon/FollowsView.tsx` |
| Help・使い方 | `components/beacon/HowtoView.tsx` |
| 設定・画面全体 | `components/beacon/BeaconApp.tsx` |
| 問い合わせ | `app/contact/page.tsx` |
| 利用規約 | `app/terms/page.tsx` |
| プライバシーポリシー | `app/privacy/page.tsx` |

対象の文字がどのファイルにあるか分からない場合は、次のコマンドで探せます。

```powershell
rg -n "探したい文字" app components
```

## 特定のUIだけ調整する

パネルの「追加CSS」に入力すると、保存前に実画面で確認できます。

```css
.profileEditButton {
  font-size: 13px;
  padding: 8px 14px;
}
```

ブラウザの開発者ツールで要素を選択すると、対象のクラス名を確認できます。

## 確定前の確認

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:dev-ui
```
