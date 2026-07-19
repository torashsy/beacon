import { SELLING_POINTS } from "@/lib/beacon/sellingPoints";

export function HowtoView() {
  return (
    <section className="view guideView">
      <h1>via-miの使い方</h1>
      <p className="lead guideIntro">
        複数のSNSアカウントや連絡先、予定をひとつのページにまとめて、URLかQRコードひとつで共有できるサービスです。
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
    </section>
  );
}
