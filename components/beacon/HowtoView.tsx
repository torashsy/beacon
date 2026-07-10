// 使い方。beacon.html の v-howto を移植（静的表示のみ）。

const STEPS: [string, string][] = [
  ["IDを作る", "IDとパスコードだけで作成できます。メールアドレスは不要です。"],
  [
    "復旧コードを控える",
    "パスコードを忘れた時に使えます。作成時に一度だけ表示されるので必ず控えてください。",
  ],
  [
    "リンクをまとめる",
    "X・Instagram・LINEなどの連絡先を登録します。1つ使えなくなっても他が残ります。",
  ],
  [
    "IDを相手に伝える",
    "公開ページのリンクをプロフィールに貼るだけ。相手はそこから今の連絡先を確認できます。",
  ],
  [
    "使えなくなったら「停止」に",
    "停止にすると、相手には有効なリンクだけが表示されます。",
  ],
  [
    "別の端末からも使える",
    "IDとパスコードでログインすれば、どの端末からでも編集できます。",
  ],
];

export function HowtoView() {
  return (
    <section className="view">
      <h1>使い方</h1>
      <div className="lead">
        垢が凍結されても連絡先を失わないためのアプリです。
      </div>
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
