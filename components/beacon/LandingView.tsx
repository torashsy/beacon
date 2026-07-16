"use client";

import { PublicProfileCard, type PublicCardData } from "./PublicProfileCard";
import { LegalFooter } from "./LegalFooter";

/** 未ログイン時のトップ。操作と完成イメージだけを見せる。 */

const DEMO: PublicCardData = {
  handle: "via_mi_sample",
  profile: {
    name: "みほん",
    bio: "連絡先はここにまとめています🌸",
    emoji: "🌸",
    theme: 0,
    av_theme: 5,
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

export function LandingView({
  onCreate,
  onLogin,
}: {
  onCreate: () => void;
  onLogin: () => void;
}) {
  return (
    <section className="view">
      <h1 className="landingTitle">あなたのSNS、全部ひとつに。</h1>
      <button className="btn sig" onClick={onCreate}>
        無料でIDを作る
      </button>
      <button className="btn ghost" onClick={onLogin}>
        ログイン
      </button>

      <h2>見本</h2>
      <div style={{ pointerEvents: "none", userSelect: "none" }} aria-hidden>
        <PublicProfileCard data={DEMO} />
      </div>
      <LegalFooter />
    </section>
  );
}
