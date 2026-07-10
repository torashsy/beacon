/**
 * トップ（未ログイン: 認証 / ログイン済み: プロフィール編集）。
 *
 * ★ここは下準備の入口スタブ。実装は reference/beacon.html の以下を移植する:
 *   - 認証ビュー（アカウント作成 / ログイン / 復旧コードで再設定）
 *     → lib/beacon/rpc.ts の createAccount / verifyLogin / resetPass を使う
 *   - プロフィール編集（Xと同じ ✕/保存バー + タップで画像変更）
 *     → updateProfile / saveChannels / saveCal、画像は lib/beacon/storage.ts
 *   - リンク（種類/表示名/説明/並び替え/有効・停止）、カレンダーメモ、使い方
 *
 * セッション: localStorage に handle+pass を平文で持たない。
 *   HANDOFF の指示どおり「暗号化保存」か「書込ごとに再入力」を選ぶ。
 *   まずは各書込 RPC に毎回 pass を渡す前提でメモリ保持 → 方式を提案する。
 */
export default function HomePage() {
  return (
    <main className="wrap" style={{ paddingTop: 24 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22 }}>
        Beacon <span style={{ color: "var(--em2)" }}>·</span>
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
        下準備済みスタブです。認証・プロフィール編集の実装は
        <code> reference/beacon.html</code> を移植してください。
        RPC 呼び出しは <code>lib/beacon/rpc.ts</code> に用意済み。
      </p>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
        公開ページの動作確認は <code>/@あなたのハンドル</code> を開いてください。
      </p>
    </main>
  );
}
