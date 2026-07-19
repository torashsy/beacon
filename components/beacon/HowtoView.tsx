const STEPS = [
  {
    title: "IDを作る（パスワード不要）",
    description:
      "好きなID（半角英数字）を決めるだけで登録完了。端末にパスキーが保存されるので、パスワードを覚える必要はありません。",
    path: "トップ → はじめる",
  },
  {
    title: "載せたい情報を追加する",
    description:
      "SNSや連絡先のリンク、予定、写真の中から必要なものだけを選んで登録します。使わない項目はそのままで構いません。",
    path: "me → 追加したい項目を選ぶ",
  },
  {
    title: "できたページを相手に渡す",
    description: "自分のページのURLを送るか、QRコードを見せるだけで相手に渡せます。",
    path: "me → 共有 / QRコード",
  },
  {
    title: "気になる相手をフォローする",
    description:
      "相手のIDをそのまま入力して検索・フォローすると、リンクや予定が更新されたときに気づけます（名前や条件でのあいまい検索はできません）。",
    path: "Follow → ID検索",
  },
];

const USE_CASES = [
  { emoji: "🌸", title: "芸能人・インフルエンサー", text: "DM窓口や公式LINE、ライブ予定をまとめて案内" },
  { emoji: "☕", title: "飲食店", text: "営業時間、予約用LINE、地図へのリンクを1ページに集約" },
  { emoji: "🏢", title: "企業", text: "採用ページやお知らせ、問い合わせ窓口を整理して掲載" },
  { emoji: "🎮", title: "個人", text: "普段使うSNSや配信予定をまとめて、フォロワーに共有" },
];

export function HowtoView() {
  return (
    <section className="view guideView">
      <h1>via-miの使い方</h1>
      <p className="lead guideIntro">
        複数のSNSアカウントや連絡先、予定をひとつのページにまとめて、URLかQRコードひとつで共有できるサービスです。
      </p>
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

      <h2 className="guideUseCasesTitle">こんな使い方ができます</h2>
      <div className="guideUseCases">
        {USE_CASES.map((u) => (
          <div className="useCase" key={u.title}>
            <span className="useCaseEmoji" aria-hidden>{u.emoji}</span>
            <div className="useCaseText">
              <strong>{u.title}</strong>
              <span>{u.text}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="lead guideSampleHint">トップページの「見本」から、実際の見え方を確認できます。</p>
    </section>
  );
}
