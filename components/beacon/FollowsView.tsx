"use client";

import { useEffect, useState, useTransition } from "react";
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

/**
 * 一覧に出す「更新時刻」。相手が実際にページを更新した時刻(pageUpdated)を優先し、
 * 無い/不正な場合だけ従来のスナップショット取得時刻(updated)にフォールバックする。
 */
function followTime(f: FollowSnapshot): number {
  const parsed = f.pageUpdated ? Date.parse(f.pageUpdated) : NaN;
  return Number.isFinite(parsed) ? parsed : f.updated;
}

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
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ handle: string; page: PublicPage } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
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
    const timer = window.setTimeout(() => {
      for (const follow of follows.slice(0, 6)) router.prefetch(`/@${follow.handle}`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [follows, router]);

  function openProfile(handle: string) {
    // タップから公開ページ(/@handle)のRSC取得が終わるまで isPending が続く。
    // その間ローディングを出し、遷移待ちの「無反応で固まって見える」状態をなくす。
    startTransition(() => {
      router.push(`/@${handle}`);
    });
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
      {isPending && (
        <div className="navLoading" role="status" aria-label="読み込み中">
          <span className="navLoadingSpinner" aria-hidden="true" />
        </div>
      )}
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
      <div className="searchHint">ユーザーIDを入力して検索できます。</div>
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
              <img src={found.page.profile.av_url} alt="" loading="lazy" decoding="async" />
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
              const st = states[f.handle] ?? { state: "loading", addedLive: 0 };
              return (
                <div
                  key={f.handle}
                  className="frow"
                  role="link"
                  tabIndex={0}
                  onPointerDown={() => router.prefetch(`/@${f.handle}`)}
                  onFocus={() => router.prefetch(`/@${f.handle}`)}
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
                      <img src={f.av_url} alt="" loading="lazy" decoding="async" />
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
                      ・{ago(followTime(f))}
                    </div>
                  </div>
                  {st.state === "new" || st.state === "changed" ? (
                    <button
                      className="unf"
                      style={{
                        borderColor: "color-mix(in srgb, var(--em) 45%, transparent)",
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
  if (st.state === "new") {
    return (
      <span className="followLamp new">
        <span className="bulb" aria-hidden />
        新しい連絡先{st.addedLive > 1 ? ` +${st.addedLive}` : ""}
      </span>
    );
  }
  if (st.state === "changed") {
    return (
      <span className="followLamp changed">
        <span className="bulb" aria-hidden />
        更新あり
      </span>
    );
  }
  if (st.state === "deleted") {
    return (
      <span className="followLamp deleted">
        <span className="bulb" aria-hidden />
        削除ずみ
      </span>
    );
  }
  return null;
}
