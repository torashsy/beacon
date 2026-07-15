"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ago } from "@/lib/beacon/format";
import { HEADING_TYPE } from "@/lib/beacon/constants";
import type { FollowSnapshot, FollowStatus } from "@/lib/beacon/follows";
import type { PublicPage } from "@/lib/beacon/rpc";

/**
 * フォロー中一覧（表示専用）。表示用データは端末ローカル、ID一覧はログイン時にサーバー同期する。
 * 変化検知（各相手の最新取得と差分）は BeaconApp 側で行い、ここは states を
 * 受け取ってバッジ表示するだけ（ナビの更新ドットと計算を共有するため）。
 * 一覧・名前検索・おすすめは行わず、未フォローの相手はID完全一致でのみ取得する。
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
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ handle: string; page: PublicPage } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [openingHandle, setOpeningHandle] = useState<string | null>(null);
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

  useEffect(() => {
    for (const follow of follows) router.prefetch(`/@${follow.handle}`);
  }, [follows, router]);

  function openProfile(handle: string) {
    setOpeningHandle(handle);
    router.push(`/@${handle}`);
  }

  async function searchById(e: React.FormEvent) {
    e.preventDefault();
    const handle = q.trim().replace(/^@/, "").toLowerCase();
    setFound(null);
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setSearchMessage("半角英数字と _ でIDを入力してください");
      return;
    }
    setSearching(true);
    setSearchMessage("");
    try {
      const response = await fetch(`/api/user-search?handle=${encodeURIComponent(handle)}`, {
        cache: "no-store",
      });
      if (response.status === 429) {
        setSearchMessage("検索回数が多すぎます。しばらく待ってからお試しください");
        return;
      }
      if (!response.ok) throw new Error("search failed");
      const page = (await response.json()) as PublicPage | null;
      if (page) {
        router.prefetch(`/@${handle}`);
        setFound({ handle, page });
      }
      else setSearchMessage("このIDのユーザーは見つかりませんでした");
    } catch {
      setSearchMessage("検索できませんでした。通信状況をご確認ください");
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="view">
      <h1>フォロー中</h1>
      {!loggedIn && (
        <div className="note" style={{ marginBottom: 12 }}>
          ゲストのフォローはこの端末に保存されます。{' '}
          <button
            type="button"
            className="textlink"
            onClick={onLoginPrompt}
          >
            ログイン
          </button>
        </div>
      )}
      <form className="search userSearch" onSubmit={searchById}>
        <svg className="searchIcon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setFound(null);
            setSearchMessage("");
          }}
          placeholder="フォロー中の名前 / ユーザーID"
        />
        <button type="submit" disabled={searching}>
          {searching ? "検索中" : "ID検索"}
        </button>
      </form>
      <div className="searchHint">フォローしていない人は、IDの完全一致で検索できます。</div>
      {searchMessage && <div className="searchMessage">{searchMessage}</div>}
      {found && (
        <div
          className="card userSearchResult"
          role="link"
          tabIndex={0}
          onClick={() => openProfile(found.handle)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openProfile(found.handle);
            }
          }}
        >
          <div className="av">
            {found.page.profile.av_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={found.page.profile.av_url} alt="" />
            ) : (
              found.page.profile.emoji || found.handle[0]?.toUpperCase()
            )}
          </div>
          <div className="who">
            <div className="nm">{found.page.profile.name || `@${found.handle}`}</div>
            <div className="id">@{found.handle}</div>
            <div className="st">{found.page.follower_count.toLocaleString("ja-JP")} フォロワー</div>
          </div>
          <span className="searchResultArrow">→</span>
        </div>
      )}
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
              まだフォローしていません。
              <br />相手のページから追加できます。
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
                  className={`frow${openingHandle === f.handle ? " is-opening" : ""}`}
                  role="link"
                  tabIndex={0}
                  onClick={() => openProfile(f.handle)}
                  onKeyDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProfile(f.handle);
                    }
                  }}
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
                      {dead ? `・${dead}件非表示` : ""}・{ago(f.updated)}
                    </div>
                  </div>
                  {st.state === "new" || st.state === "changed" ? (
                    <button
                      className="unf"
                      style={{
                        borderColor: "rgba(56,189,248,.45)",
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
          border: "1.5px solid rgba(56,189,248,.45)",
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
