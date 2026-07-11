/** 利用規約・プライバシーポリシーへの導線。ランディングと公開ページの末尾に置く。 */
export function LegalFooter() {
  return (
    <div
      style={{
        marginTop: 20,
        textAlign: "center",
        fontSize: 11,
        color: "var(--faint)",
      }}
    >
      <a href="/terms" style={{ color: "var(--muted)" }}>
        利用規約
      </a>
      <span style={{ margin: "0 8px" }}>·</span>
      <a href="/privacy" style={{ color: "var(--muted)" }}>
        プライバシーポリシー
      </a>
    </div>
  );
}
