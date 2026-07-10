"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getPublicPage } from "@/lib/beacon/rpc";
import { ago } from "@/lib/beacon/format";
import { HEADING_TYPE } from "@/lib/beacon/constants";
import {
  type FollowSnapshot,
  toSnapshot,
} from "@/lib/beacon/follows";

/**
 * フォロー中一覧。データは端末ローカル(localStorage)のみ。
 * 「変化検知」: 開いた時に各相手の公開ページを取得し、フォロー時のスナップショットと
 * 比較して「新しい連絡先が増えた／連絡先が変わった／削除された」をバッジ表示する。
 * これがフォローの存在意義（相手の垢が変わっても今の連絡先が分かる）。
 * サーバーへの横断検索・一覧はしない（自分がフォローしたIDを個別に取得するだけ）。
 */

type DiffState = "loading" | "same" | "new" | "changed" | "deleted";

interface FollowState {
  state: DiffState;
  addedLive: number; // 増えた有効リンク数
  fresh?: FollowSnapshot; // 取得した最新（「最新にする」で採用）
}

function liveUrls(channels: { type: string; url: string; status: string }[]) {
  return new Set(
    channels
      .filter((c) => c.type !== HEADING_TYPE && c.status === "live")
      .map((c) => c.url),
  );
}

export function FollowsView({
  follows,
  onUnfollow,
  onUpdateSnapshot,
}: {
  follows: FollowSnapshot[];
  onUnfollow: (handle: string) => void;
  onUpdateSnapshot: (snap: FollowSnapshot) => void;
}) {
  const [q, setQ] = useState("");
  const [states, setStates] = useState<Record<string, FollowState>>({});
  const router = useRouter();
  const db = useMemo(() => createClient(), []);

  // 開いたときに各フォローの最新を取得して差分を計算
  useEffect(() => {
    let cancelled = false;
    const handles = follows.map((f) => f.handle);
    if (!handles.length) return;
    setStates((prev) => {
      const next = { ...prev };
      for (const h of handles) if (!next[h]) next[h] = { state: "loading", addedLive: 0 };
      return next;
    });
    (async () => {
      await Promise.all(
        follows.map(async (snap) => {
          try {
            const page = await getPublicPage(db, snap.handle);
            if (cancelled) return;
            if (!page) {
              setStates((s) => ({ ...s, [snap.handle]: { state: "deleted", addedLive: 0 } }));
              return;
            }
            const snapLive = liveUrls(snap.channels);
            const curLive = liveUrls(page.channels);
            const added = [...curLive].filter((u) => !snapLive.has(u));
            const removed = [...snapLive].filter((u) => !curLive.has(u));
            const nameChanged = (page.profile.name || "") !== (snap.name || "");
            const fresh = toSnapshot(page.profile, page.channels, page.cal);
            let state: DiffState = "same";
            if (added.length) state = "new";
            else if (removed.length || nameChanged) state = "changed";
            setStates((s) => ({
              ...s,
              [snap.handle]: { state, addedLive: added.length, fresh },
            }));
          } catch {
            if (!cancelled)
              setStates((s) => ({ ...s, [snap.handle]: { state: "same", addedLive: 0 } }));
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // follows の顔ぶれが変わった時だけ再取得
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follows.map((f) => f.handle).join(","), db]);

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
                    <div className="nm">
                      {f.name || `@${f.handle}`}
                      <FollowBadge st={st} />
                    </div>
                    <div className="id">@{f.handle}</div>
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
                        setStates((s) => ({
                          ...s,
                          [f.handle]: { state: "same", addedLive: 0 },
                        }));
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

function FollowBadge({ st }: { st: FollowState }) {
  if (st.state === "new") {
    return (
      <span
        style={{
          marginLeft: 8,
          fontSize: 10.5,
          fontWeight: 700,
          color: "#fff",
          background: "var(--em)",
          borderRadius: 999,
          padding: "2px 8px",
        }}
      >
        新しい連絡先{st.addedLive > 1 ? ` +${st.addedLive}` : ""}
      </span>
    );
  }
  if (st.state === "changed") {
    return (
      <span
        style={{
          marginLeft: 8,
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--emd)",
          border: "1.5px solid rgba(16,185,129,.45)",
          borderRadius: 999,
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
          marginLeft: 8,
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--alert)",
          border: "1.5px solid rgba(224,87,107,.45)",
          borderRadius: 999,
          padding: "1px 8px",
        }}
      >
        削除ずみ
      </span>
    );
  }
  return null;
}
