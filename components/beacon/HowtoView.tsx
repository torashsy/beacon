import Link from "next/link";
import { SELLING_POINTS } from "@/lib/beacon/sellingPoints";
import { FeatureIcon } from "./icons";

export function HowtoView() {
  return (
    <section className="view guideView">
      <h1 className="guideHeading">via-miとは</h1>
      <p className="lead guideIntro">
        SNSアカウントやリンク、カレンダーや写真をひとつのページにまとめて、
        IDやQRコードで簡単に共有できるサービスです。
      </p>
      <div className="guideUseCases">
        {SELLING_POINTS.map((p) => (
          <div className="useCase" key={p.title}>
            <span className="useCaseEmoji">
              <FeatureIcon name={p.icon} />
            </span>
            <div className="useCaseText">
              <strong>{p.title}</strong>
              <span>{p.text}</span>
            </div>
          </div>
        ))}
      </div>
      <Link className="guideLink" href="/guide">
        <FeatureIcon name="book" />
        使い方ガイドを見る
      </Link>
    </section>
  );
}
