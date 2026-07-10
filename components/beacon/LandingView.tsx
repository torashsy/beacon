"use client";

import { PublicProfileCard, type PublicCardData } from "./PublicProfileCard";

/**
 * 未ログイン時のトップ（ランディング）。
 * 方針（ユーザー合意済み）:
 *   - キャッチコピーは「あなたのSNS、全部ひとつに。」一本。
 *   - 設計思想（X風UI等）は語らず、ユーザーにとってのメリットを機能で示す。
 *   - 単なるリンク集との違い＝カレンダー告知・停止表示・検索されない匿名性を軸に、
 *     具体的な利用シーン（芸能・配信・創作・店舗）で補強する。
 */

const DEMO: PublicCardData = {
  handle: "beacon_sample",
  profile: {
    name: "みほん",
    bio: "新しい連絡先はここにまとめています🌸",
    emoji: "🌸",
    theme: 0,
    av_url: "",
    bn_url: "",
  },
  channels: [
    {
      type: "x",
      url: "#",
      label: "メイン垢",
      descr: "DMはこちらへ",
      status: "live",
    },
    {
      type: "instagram",
      url: "#",
      label: "",
      descr: "日常はこっち",
      status: "live",
    },
    { type: "line", url: "#", label: "", descr: "", status: "live" },
    { type: "x", url: "#", label: "旧メイン垢", descr: "", status: "dead" },
  ],
  pubcal: [
    { d: "2026-07-12", memo: "ライブ出演 19:00〜 @渋谷" },
    { d: "2026-07-15", memo: "20時以降 空きあり" },
  ],
};

/** ユーザーにとってのメリット（リンク集との違いが伝わる順）。 */
const BENEFITS: [string, string, string][] = [
  [
    "📌",
    "配るURLは、これひとつ",
    "X・Instagram・LINEなどの連絡先を1ページに。垢が増えても引っ越しても、プロフィールに貼るURLは変わりません。",
  ],
  [
    "📅",
    "予定やイベントもまとめて告知",
    "ライブ・出演・配信・空き日…日付ごとのメモを公開ページに載せられます。リンクだけでは伝わらない「今の動き」まで届く、リンク集との一番の違いです。",
  ],
  [
    "🚦",
    "使えなくなった垢は「停止」表示",
    "凍結・乗っ取り・移行のとき、訪問者には有効な連絡先だけが目立つ形で伝わります。「どれが本物？」と迷わせません。",
  ],
  [
    "🕶",
    "メール不要・検索されない",
    "IDとパスコードだけで作成。ユーザー検索やおすすめ表示は一切ないので、URLを渡した相手だけがあなたのページにたどり着けます。",
  ],
];

/** 具体的な利用シーン。 */
const USE_CASES: [string, string, string][] = [
  [
    "🎤",
    "アーティスト・アイドル",
    "ライブや出演情報をカレンダーで告知。チケットや特典のリンクも1ページに。",
  ],
  [
    "🎮",
    "配信者・VTuber",
    "配信予定を公開メモで。プラットフォームが増えても、ファンに配るURLはひとつのまま。",
  ],
  [
    "🎨",
    "創作・同人",
    "新刊やイベント参加予定を告知。支援ページへのリンクも並べられます。",
  ],
  [
    "💼",
    "お店・フリーランス",
    "営業日や空き枠をカレンダーで見せて、予約や問い合わせはDM・LINEへ誘導。",
  ],
];

const STEPS: [string, string][] = [
  ["IDを作る", "メールアドレス不要。IDとパスコードだけ、30秒で完了。"],
  ["リンクと予定を登録", "今使っている連絡先を追加。予定はカレンダーにメモ。"],
  [
    "URLを配る",
    "公開ページのURLを各SNSのプロフィールに貼るだけ。あとは更新するたび、相手に最新が届きます。",
  ],
];

export function LandingView({
  onCreate,
  onLogin,
}: {
  onCreate: () => void;
  onLogin: () => void;
}) {
  return (
    <section className="view">
      <h1>あなたのSNS、全部ひとつに。</h1>
      <button className="btn sig" onClick={onCreate}>
        無料でIDを作る
      </button>
      <button className="btn ghost" onClick={onLogin}>
        ログイン
      </button>

      <h2>こんな公開ページが30秒で作れます</h2>
      <div style={{ pointerEvents: "none", userSelect: "none" }} aria-hidden>
        <PublicProfileCard data={DEMO} />
      </div>

      <h2>Beacon でできること</h2>
      {BENEFITS.map(([icon, t, d]) => (
        <div className="step" key={t}>
          <div className="no" style={{ background: "var(--eml)" }}>
            {icon}
          </div>
          <div className="stx">
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        </div>
      ))}

      <h2>こんな使い方</h2>
      {USE_CASES.map(([icon, t, d]) => (
        <div className="step" key={t}>
          <div className="no" style={{ background: "var(--eml)" }}>
            {icon}
          </div>
          <div className="stx">
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        </div>
      ))}

      <h2>はじめかた</h2>
      {STEPS.map(([t, d], i) => (
        <div className="step" key={t}>
          <div className="no">{i + 1}</div>
          <div className="stx">
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        </div>
      ))}

      <div className="note">
        Beacon はお金のやり取りを仲介しません。「支援」は外部サービスのURLを
        貼るだけです。
      </div>

      <button className="btn sig" onClick={onCreate} style={{ marginTop: 18 }}>
        無料でIDを作る
      </button>
      <div className="authswitch">
        すでにIDがある → <a onClick={onLogin}>ログイン</a>
      </div>
    </section>
  );
}
