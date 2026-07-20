import Link from "next/link";
import { SELLING_POINTS } from "@/lib/beacon/sellingPoints";

export function HowtoView() {
  return (
    <section className="view guideView">
      <h1 className="brandHeading">
        <span className="brandWordmark" role="img" aria-label="via-mi" />
        とは
      </h1>
      <p className="lead guideIntro">
        SNSアカウントやリンク、カレンダーや写真をひとつのページにまとめて、
        <br />
        IDやQRコードで簡単に共有できるサービスです。
      </p>
      <div className="guideUseCases">
        {SELLING_POINTS.map((p) => (
          <div className="useCase" key={p.title}>
            <span className="useCaseEmoji" aria-hidden>{p.emoji}</span>
            <div className="useCaseText">
              <strong>{p.title}</strong>
              <span>{p.text}</span>
            </div>
          </div>
        ))}
      </div>
      <Link className="guideLink" href="/guide">
        📖 使い方ガイドを見る
      </Link>
    </section>
  );
}
