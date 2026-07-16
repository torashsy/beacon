import Link from "next/link";

/** 利用規約・プライバシーポリシーへの導線。ランディングと公開ページの末尾に置く。 */
export function LegalFooter() {
  return (
    <div
      style={{
        marginTop: 20,
        textAlign: "center",
        fontSize: 11,
        color: "var(--faint)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <Link href="/terms" style={{ color: "var(--muted)" }}>
        利用規約
      </Link>
      <span>·</span>
      <Link href="/privacy" style={{ color: "var(--muted)" }}>
        プライバシーポリシー
      </Link>
      <span> · </span>
      <Link href="/contact" style={{ color: "var(--muted)" }}>
        お問い合わせ
      </Link>
    </div>
  );
}
