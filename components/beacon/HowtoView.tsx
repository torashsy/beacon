// 使い方。beacon.html の v-howto を移植（静的表示のみ）。

const STEPS: [string, string][] = [
  ["作成", "IDを決め、Face IDなどでパスキーを作ります。"],
  ["追加", "リンクと予定を登録します。"],
  ["認証", "復旧用のメールまたは電話番号を追加します。紛失時はログイン画面から復旧できます。"],
  ["共有", "公開ページのURLを相手に送ります。"],
];

export function HowtoView() {
  return (
    <section className="view">
      <h1>使い方</h1>
      {STEPS.map(([t, d], i) => (
        <div className="step" key={i}>
          <div className="no">{i + 1}</div>
          <div className="stx">
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
