"use client";

import { PublicProfileCard, type PublicCardData } from "./PublicProfileCard";
import { LegalFooter } from "./LegalFooter";

/**
 * 未ログイン時のトップ（ランディング）。
 * 方針（ユーザー合意済み）: シンプル最優先。キャッチ1本＋サンプル1枚＋要点3つだけ。
 * 機能の網羅紹介はしない（触れば分かるものは語らない）。
 */

const DEMO: PublicCardData = {
  handle: "beacon_sample",
  profile: {
    name: "みほん",
    bio: "連絡先はここにまとめています🌸",
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
    { type: "instagram", url: "#", label: "", descr: "", status: "live" },
    { type: "line", url: "#", label: "", descr: "", status: "live" },
  ],
  pubcal: [{ d: "2026-07-12", memo: "ライブ出演 19:00〜 @渋谷" }],
};

const POINTS: [string, string, string][] = [
  ["📌", "配るURLはひとつ", "連絡先をまとめて、プロフィールにはこのURLだけ。"],
  ["📅", "予定も告知できる", "ライブ・イベント・空き日をカレンダーで。"],
  [
    "🕶",
    "メール不要・検索されない",
    "IDとパスコードだけ。見られるのはURLを知っている人だけ。",
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

      {POINTS.map(([icon, t, d]) => (
        <div className="step" key={t} style={{ marginTop: 12 }}>
          <div className="no" style={{ background: "var(--eml)" }}>
            {icon}
          </div>
          <div className="stx">
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        </div>
      ))}

      <button className="btn sig" onClick={onCreate} style={{ marginTop: 18 }}>
        無料でIDを作る
      </button>
      <div className="authswitch">
        すでにIDがある → <a onClick={onLogin}>ログイン</a>
      </div>
      <LegalFooter />
    </section>
  );
}
