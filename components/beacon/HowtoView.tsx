const STEPS = [
  {
    title: "自分のページを作る",
    description: "好きなIDを決めて、端末にパスキーを保存します。パスワードは不要です。",
    path: "はじめる → 無料でIDを作る",
  },
  {
    title: "リンクや予定を載せる",
    description: "SNSやWebサイトのリンク、相手に知らせたい予定を登録します。",
    path: "me → リンクを追加 / 予定を追加",
  },
  {
    title: "自分のページを共有する",
    description: "URLを送るか、QRコードを見せるだけで相手にページを渡せます。",
    path: "me → 共有 / QRコード",
  },
  {
    title: "知り合いをフォローする",
    description: "相手のIDで検索してフォローすると、リンクや予定の更新に気づけます。",
    path: "Follow → ID検索",
  },
];

export function HowtoView() {
  return (
    <section className="view guideView">
      <h1>via-miの使い方</h1>
      <p className="lead guideIntro">SNSのリンクや予定を、ひとつのページにまとめて共有できます。</p>
      <div className="guideSteps">
        {STEPS.map((step, index) => (
          <article className="step" key={step.title}>
            <div className="no">{index + 1}</div>
            <div className="stx">
              <h2 className="t">{step.title}</h2>
              <p className="d">{step.description}</p>
              <div className="guidePath">{step.path}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
