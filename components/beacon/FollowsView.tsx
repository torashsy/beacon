"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ago } from "@/lib/beacon/format";
import type { FollowSnapshot } from "@/lib/beacon/follows";

/**
 * フォロー中一覧。beacon.html の v-follows を移植。
 * データは端末ローカル(localStorage)のみ。検索は自分のフォロー内の絞り込みで、
 * サーバーへの横断検索・一覧APIは一切呼ばない（法的制約）。
 * 行タップで公開ページ /@{handle} へ遷移する。
 */

export function FollowsView({
  follows,
  onUnfollow,
}: {
  follows: FollowSnapshot[];
  onUnfollow: (handle: string) => void;
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
              const live = f.channels.filter((c) => c.status === "live").length;
              const dead = f.channels.filter((c) => c.status === "dead").length;
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
                    <div className="st">
                      <b>{live}件のリンク</b>
                      {dead ? `・${dead}件停止中` : ""}・{ago(f.updated)}
                    </div>
                  </div>
                  <button
                    className="unf"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnfollow(f.handle);
                    }}
                  >
                    解除
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
