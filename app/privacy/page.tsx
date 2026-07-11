import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー · Beacon",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <div className="top">
        <a className="logo" href="/">
          Beacon<span className="dot">.</span>
        </a>
      </div>
      <h1>プライバシーポリシー</h1>
      <div className="lead">最終更新日: 2026年7月</div>

      <div className="card" style={{ fontSize: 13.5, lineHeight: 1.9 }}>
        <h2 style={{ margin: "0 0 8px" }}>1. 収集する情報</h2>
        <p>本サービスは、メールアドレスなどの個人情報を必須項目として収集しません。以下の情報を扱います。</p>
        <ul style={{ margin: "8px 0 0 18px" }}>
          <li>ID（ハンドル名）</li>
          <li>パスコード — ハッシュ化して保存し、平文はサーバーに保持しません</li>
          <li>復旧コード — ハッシュ化して保存し、平文は作成・再発行時に一度だけ表示します</li>
          <li>
            利用者が任意で登録するプロフィール情報（名前・自己紹介・ひとこと近況・アイコン/ヘッダー画像・
            リンク一覧・カレンダーメモ）
          </li>
          <li>
            アクセスログ・IPアドレス等 — ホスティング事業者（Vercel）およびデータベース事業者
            （Supabase）が標準的に取得するもの。不正利用防止（アカウント作成のレート制限等）にも利用します
          </li>
        </ul>

        <h2 style={{ margin: "20px 0 8px" }}>2. 利用目的</h2>
        <ul style={{ margin: "8px 0 0 18px" }}>
          <li>本サービスの提供・運用</li>
          <li>不正利用・迷惑行為の防止</li>
          <li>サービスの維持・改善</li>
        </ul>

        <h2 style={{ margin: "20px 0 8px" }}>3. Cookie・端末内保存データ</h2>
        <p>
          本サービスは、ログインID控え・フォロー中一覧・「この端末を信頼する」設定などを
          利用者の端末（localStorage）に保存します。これらは広告目的のトラッキングには使用しません。
          「この端末を信頼する」を有効にした場合、パスコードを端末内で暗号化して保存しますが、
          これは端末を特定するための鍵と同じ場所に保存される簡易的な保護であり、
          共有端末での利用は推奨しません。
        </p>

        <h2 style={{ margin: "20px 0 8px" }}>4. 第三者提供・委託</h2>
        <p>
          本サービスは、取得した情報を本人の同意なく第三者に提供することはありません。
          ただし、サービス運営のためホスティング（Vercel）およびデータベース・ストレージ
          （Supabase）を第三者に委託しており、これらの事業者のサーバーが日本国外に
          所在する場合があります。
        </p>

        <h2 style={{ margin: "20px 0 8px" }}>5. 保存期間・削除</h2>
        <p>
          プロフィール情報・リンク・カレンダーメモは、退会（アカウント削除）操作により
          データベースから削除されます。ただし、アップロードした画像ファイルについては、
          運用上の制約により退会後もストレージに残存する場合があります。この点は今後の
          改善を予定しています。
        </p>

        <h2 style={{ margin: "20px 0 8px" }}>6. 開示・削除等のご請求</h2>
        <p>
          ご自身の登録情報の確認・修正・削除は、ログイン後の編集画面および退会機能から
          行えます。それ以外のご請求については、下記お問い合わせ先までご連絡ください。
        </p>

        <h2 style={{ margin: "20px 0 8px" }}>7. お問い合わせ</h2>
        <p>本ポリシーに関するお問い合わせ窓口は現在準備中です。</p>

        <h2 style={{ margin: "20px 0 8px" }}>8. 改定</h2>
        <p>
          本ポリシーは、法令の変更やサービス内容の変更に応じて、予告なく改定する場合があります。
        </p>
      </div>
    </main>
  );
}
