"use client";

import { PublicProfileCard, type PublicCardData } from "./PublicProfileCard";

/**
 * 未ログイン時のトップ（ランディング）。
 * コンセプト: 「器はX、機能はリンクまとめ、役割はSNSのハブ」。
 * 実物の公開ページカード（サンプル）を見せて、何が作れるかを一目で伝える。
 * 検索・レコメンドが無いこと（=IDを配った相手だけが見られる）は
 * プライバシー面の利点として明示する。
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
  pubcal: [{ d: "2026-07-12", memo: "20時以降 空きあり" }],
};

const FEATURES: [string, string, string][] = [
  [
    "🐣",
    "Xと同じ操作感",
    "画面もプロフィール編集もXライク。説明書なしで、いつもの感覚で使えます。",
  ],
  [
    "🔗",
    "リンクをまとめて、止められる",
    "X・Instagram・LINEなどを1ページに。使えなくなった垢は「停止」にすれば、相手には今つながれる連絡先だけが伝わります。",
  ],
  [
    "📅",
    "カレンダーで空き告知",
    "日ごとのメモを公開/非公開で使い分け。空き日の告知などに使えます。",
  ],
  [
    "🛟",
    "凍結されても変わらないID",
    "垢が消えてもBeaconのIDはそのまま。復旧コードでパスコードの再設定もできます。",
  ],
];

const STEPS: [string, string][] = [
  ["IDを作る", "メールアドレス不要。IDとパスコードだけ、30秒で完了。"],
  ["リンクを登録", "X・Instagram・LINEなど、今使っている連絡先を追加。"],
  [
    "IDを配る",
    "公開ページのURLをプロフィールに貼るだけ。相手はいつでも最新の連絡先にたどり着けます。",
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
      <h1>あなたのSNS、ぜんぶひとつに。</h1>
      <div className="lead">
        X・Instagram・LINE・TikTok…増え続けるSNSの「今つながれる場所」を
        ひとつにまとめる、あなた専用のハブページ。
      </div>
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
      {FEATURES.map(([icon, t, d]) => (
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
        Beacon にはユーザー検索やおすすめ表示がありません。あなたのページは、
        あなたがIDを伝えた相手だけが見られます。決済機能もありません
        （「支援」は外部サービスのURLを貼るだけ）。
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
