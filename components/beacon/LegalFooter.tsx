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
      <Link href="/terms" style={{ color: "var(--muted)" }}>
        利用規約
      </Link>
      <span style={{ margin: "0 8px" }}>·</span>
      <Link href="/privacy" style={{ color: "var(--muted)" }}>
        プライバシーポリシー
      </Link>
    </div>
  );
}
import Link from "next/link";
