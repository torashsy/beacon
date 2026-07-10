"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ago } from "@/lib/beacon/format";
import { HEADING_TYPE } from "@/lib/beacon/constants";
import type { FollowSnapshot, FollowStatus } from "@/lib/beacon/follows";

/**
 * フォロー中一覧（表示専用）。データは端末ローカル(localStorage)のみ。
 * 変化検知（各相手の最新取得と差分）は BeaconApp 側で行い、ここは states を
 * 受け取ってバッジ表示するだけ（ナビの更新ドットと計算を共有するため）。
 * サーバーへの横断検索・一覧はしない。
 */

export function FollowsView({
  follows,
  states,
  onUnfollow,
  onUpdateSnapshot,
  loggedIn,
  onLoginPrompt,
}: {
  follows: FollowSnapshot[];
  states: Record<string, FollowStatus>;
  onUnfollow: (handle: string) => void;
  onUpdateSnapshot: (snap: FollowSnapshot) => void;
  loggedIn: boolean;
  onLoginPrompt: () => void;
}) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const query = q.trim().toLowerCase();
  const shown = follows.filter(
    (f) =>
      !query ||
      f.handle.toLowerCase().includes(query) ||
      (f.name || "").toLowerCase().includes(query),
  );
  const updates = follows.filter((f) => {
    const st = states[f.handle]?.state;
    return st === "new" || st === "changed" || st === "deleted";
  }).length;

  return (
    <section className="view">
      <h1>フォロー中</h1>
      <div className="lead">相手の垢が変わっても、今の連絡先が分かります。</div>
      {!loggedIn && (
        <div className="note" style={{ marginBottom: 12 }}>
          この一覧はこの端末だけに保存されています。
          <a
            onClick={onLoginPrompt}
            style={{ color: "var(--emd)", fontWeight: 700, cursor: "pointer" }}
          >
            ログイン
          </a>
          すると自分のページも編集できます。
        </div>
      )}
      <div className="search">
        <span className="ic">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前・IDで探す"
        />
      </div>
      <div className="count">
        {follows.length
          ? `${follows.length}人をフォロー中` +
            (updates ? `・${updates}件に更新あり` : "") +
            (query ? `・${shown.length}件` : "")
          : ""}
      </div>
      <div className="card" style={{ padding: "4px 14px" }}>
        <div>
          {!follows.length ? (
            <div className="empty">
              <span className="big">📋</span>
              まだフォローしていません。
              <br />
              相手のページで「フォローする」を押すと、ここに追加されます。
            </div>
          ) : !shown.length ? (
            <div className="empty">該当する人がいません。</div>
          ) : (
            shown.map((f) => {
              const links = f.channels.filter((c) => c.type !== HEADING_TYPE);
              const live = links.filter((c) => c.status === "live").length;
              const dead = links.filter((c) => c.status === "dead").length;
              const st = states[f.handle] ?? { state: "loading", addedLive: 0 };
              return (
                <div
                  key={f.handle}
                  className="frow"
                  onClick={() => router.push(`/@${f.handle}`)}
                >
                  <div className="av">
                    {f.av_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.av_url} alt="" />
                    ) : (
                      f.emoji || f.handle[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="who">
                    <div className="nm">{f.name || `@${f.handle}`}</div>
                    <div className="id">@{f.handle}</div>
                    <FollowBadge st={st} />
                    <div className="st">
                      <b>{live}件のリンク</b>
                      {dead ? `・${dead}件停止中` : ""}・{ago(f.updated)}
                    </div>
                  </div>
                  {st.state === "new" || st.state === "changed" ? (
                    <button
                      className="unf"
                      style={{
                        borderColor: "rgba(16,185,129,.45)",
                        color: "var(--emd)",
                        background: "var(--eml)",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (st.fresh) onUpdateSnapshot(st.fresh);
                      }}
                    >
                      最新にする
                    </button>
                  ) : (
                    <button
                      className="unf"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnfollow(f.handle);
                      }}
                    >
                      解除
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function FollowBadge({ st }: { st: FollowStatus }) {
  const base = {
    display: "inline-block" as const,
    whiteSpace: "nowrap" as const,
    margin: "3px 0 1px",
    fontSize: 10.5,
    fontWeight: 700,
    borderRadius: 999,
  };
  if (st.state === "new") {
    return (
      <span style={{ ...base, color: "#fff", background: "var(--em)", padding: "2px 8px" }}>
        新しい連絡先{st.addedLive > 1 ? ` +${st.addedLive}` : ""}
      </span>
    );
  }
  if (st.state === "changed") {
    return (
      <span
        style={{
          ...base,
          color: "var(--emd)",
          border: "1.5px solid rgba(16,185,129,.45)",
          padding: "1px 8px",
        }}
      >
        更新あり
      </span>
    );
  }
  if (st.state === "deleted") {
    return (
      <span
        style={{
          ...base,
          color: "var(--alert)",
          border: "1.5px solid rgba(224,87,107,.45)",
          padding: "1px 8px",
        }}
      >
        削除ずみ
      </span>
    );
  }
  return null;
}
