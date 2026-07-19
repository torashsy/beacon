"use client";

import { useState } from "react";
import { PublicProfileCard } from "./PublicProfileCard";
import { LegalFooter } from "./LegalFooter";
import { SAMPLE_PROFILES } from "@/lib/beacon/sampleProfiles";

/** 未ログイン時のトップ。操作と完成イメージだけを見せる。 */

export function LandingView({
  onCreate,
  onLogin,
}: {
  onCreate: () => void;
  onLogin: () => void;
}) {
  const [sampleId, setSampleId] = useState(SAMPLE_PROFILES[0].id);
  const sample = SAMPLE_PROFILES.find((s) => s.id === sampleId) ?? SAMPLE_PROFILES[0];

  return (
    <section className="view">
      <h1 className="landingTitle">あなたのSNSを、全部ひとつに。</h1>
      <button className="btn sig" onClick={onCreate}>
        はじめる
      </button>
      <button className="btn ghost" onClick={onLogin}>
        ログイン
      </button>

      <h2>例えば、こんな風に。</h2>

      <div className="sampleTabs" role="group" aria-label="見本の切り替え">
        {SAMPLE_PROFILES.map((s) => (
          <button
            type="button"
            key={s.id}
            className={sampleId === s.id ? "on" : ""}
            aria-pressed={sampleId === s.id}
            onClick={() => setSampleId(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ pointerEvents: "none", userSelect: "none" }} aria-hidden>
        <PublicProfileCard data={sample.data} />
      </div>
      <LegalFooter />
    </section>
  );
}
