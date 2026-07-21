import Link from "next/link";

/**
 * 存在しないページ（未登録の /@handle や不正なURL）で表示する日本語の404。
 * Next.js 既定の英語画面ではなく、ブランドに合わせた案内を出す。
 */
export const metadata = {
  title: "ページが見つかりません · via-mi",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="notFound">
      <span className="logo" aria-hidden="true">via-mi</span>
      <p className="notFoundCode">404</p>
      <h1 className="notFoundTitle">ページが見つかりません</h1>
      <p className="notFoundText">
        お探しのページは削除されたか、URLが間違っている可能性があります。
      </p>
      <Link className="btn sig" href="/">
        トップへ戻る
      </Link>
    </main>
  );
}
