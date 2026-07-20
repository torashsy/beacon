"use client";

import { useEffect, useState } from "react";
import { PublicProfileCard, type PublicCardData } from "./PublicProfileCard";
import { LegalFooter } from "./LegalFooter";
import { SAMPLE_PROFILES } from "@/lib/beacon/sampleProfiles";
import { SELLING_POINTS } from "@/lib/beacon/sellingPoints";
import { createClient } from "@/lib/supabase/client";
import { getPublicPage } from "@/lib/beacon/rpc";

/** 未ログイン時のトップ。操作と完成イメージだけを見せる。 */

/**
 * 見本ハンドルの実アカウントに表示できる中身があるか。
 * アカウントを作った直後の空プロフィールを見本に出さないためのガード。
 * カレンダーは常に自動生成の相対日付を使う（下記参照）ため判定には含めない。
 */
function hasContent(data: PublicCardData): boolean {
  return data.channels.some((c) => c.status === "live") || Boolean(data.profile.bio);
}

export function LandingView({
  onCreate,
  onLogin,
}: {
  onCreate: () => void;
  onLogin: () => void;
}) {
  const [sampleId, setSampleId] = useState(SAMPLE_PROFILES[0].id);
  const sample = SAMPLE_PROFILES.find((s) => s.id === sampleId) ?? SAMPLE_PROFILES[0];

  // 見本ハンドルと同名の実アカウントが存在すればその公開内容を優先表示する
  // （運営が実アカウント側を編集するだけで見本を更新できる）。
  // null = 取得済みだが実データなし（静的見本のまま）。
  const [live, setLive] = useState<Record<string, PublicCardData | null>>({});

  const handle = sample.data.handle;
  useEffect(() => {
    if (live[handle] !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const db = createClient();
        const page = await Promise.race([
          getPublicPage(db, handle),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
        if (cancelled) return;
        const data: PublicCardData | null = page
          ? { handle, profile: page.profile, channels: page.channels, pubcal: page.cal }
          : null;
        setLive((prev) => ({
          ...prev,
          [handle]: data && hasContent(data) ? data : null,
        }));
      } catch {
        if (!cancelled) {
          setLive((prev) => ({ ...prev, [handle]: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, live]);

  // カレンダーだけは実アカウントの内容に関わらず、常に見本側の相対日付を使う。
  // 実アカウントの予定は日が経つと過去日として非公開ページから消えるため、
  // 見本の鮮度維持を運営者の手動更新に依存させない。
  const liveData = live[handle];
  const card: PublicCardData = liveData
    ? { ...liveData, pubcal: sample.data.pubcal }
    : sample.data;

  return (
    <section className="view">
      <h1 className="landingTitle">あなたのSNSを、全部ひとつに。</h1>
      <button className="btn sig" onClick={onCreate}>
        はじめる
      </button>
      <button className="btn ghost" onClick={onLogin}>
        ログイン
      </button>

      <div className="guideUseCases landingPoints">
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
        <PublicProfileCard data={card} />
      </div>
      <LegalFooter />
    </section>
  );
}
