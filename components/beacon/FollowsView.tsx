"use client";

import { useEffect, useState } from "react";
import { ago } from "@/lib/beacon/format";
import { grad, HEADING_TYPE } from "@/lib/beacon/constants";
import { toSnapshot, type FollowSnapshot, type FollowStatus } from "@/lib/beacon/follows";
import type { FollowerRow, PublicPage } from "@/lib/beacon/rpc";

/**
 * フォロー中一覧（表示専用）。表示用データは端末ローカル、ID一覧はログイン時にサーバー同期する。
 * 変化検知（各相手の最新取得と差分）は BeaconApp 側で行い、ここは states を
 * 受け取ってバッジ表示するだけ（ナビの更新ドットと計算を共有するため）。
 * 一覧・名前検索・おすすめは行わず、未フォローの相手はID完全一致でのみ取得する。
 */

/**
 * 一覧に出す「更新時刻」。相手が実際にページを更新した時刻(pageUpdated)を表示する。
 * 更新チェック済みなら最新取得分(st.fresh.pageUpdated)を優先する。保存済み
 * スナップショットの時刻(f.pageUpdated)は前回同期時点で古いことがあるため。
 * どちらも無ければ取得時刻(updated)にフォールバックする。
 */
function followTime(f: FollowSnapshot, st?: FollowStatus): number {
  const iso = st?.fresh?.pageUpdated ?? f.pageUpdated;
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(parsed) ? parsed : f.updated;
}

/**
 * フォロワー一覧の1件から、プレビューを即開くための最小スナップショットを作る。
 * リンクや自己紹介は持たないが、ProfilePreview が裏で公開ページを取得して
 * 差し替えるため、フォロー中と同様タップした瞬間にプレビューが立ち上がる。
 */
function followerToSnapshot(f: FollowerRow): FollowSnapshot {
  return {
    handle: f.handle,
    name: f.name,
    emoji: f.emoji,
    theme: 0,
    av_theme: f.av_theme,
    av_url: f.av_url,
    bn_url: "",
    channels: [],
    pubcal: [],
    updated: Date.now(),
  };
}

export function FollowsView({
  follows,
  states,
  onUnfollow,
  onOpenProfile,
  onLoadFollowers,
  mode,
  onModeChange,
  loggedIn,
  onLoginPrompt,
  initialSearch,
  initialSearchKey = 0,
}: {
  follows: FollowSnapshot[];
  states: Record<string, FollowStatus>;
  onUnfollow: (handle: string) => void;
  /** タップで遷移せずアプリ内プレビューを開く。 */
  onOpenProfile: (snap: FollowSnapshot) => void;
  /** 自分をフォローしている相手の一覧を取得（本人のみ）。 */
  onLoadFollowers: () => Promise<FollowerRow[]>;
  /** 「フォロー中 / フォロワー」の表示モード（親が保持）。 */
  mode: "following" | "followers";
  onModeChange: (mode: "following" | "followers") => void;
  loggedIn: boolean;
  onLoginPrompt: () => void;
  initialSearch?: string;
  initialSearchKey?: number;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ handle: string; page: PublicPage } | null>(null);
  const [tagResults, setTagResults] = useState<FollowerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [sort, setSort] = useState<"added" | "updated">("added");
  // フォロワー一覧（本人のみ・要ログイン）。「フォロワー」タブを開いた時に取得する。
  const [followers, setFollowers] = useState<FollowerRow[] | null>(null);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followersError, setFollowersError] = useState("");
  const followingSet = new Set(follows.map((f) => f.handle.toLowerCase()));
  const query = q.trim().toLowerCase();
  const filtered = follows.filter(
    (f) =>
      !query ||
      f.handle.toLowerCase().includes(query) ||
      (f.name || "").toLowerCase().includes(query),
  );
  // 「更新順」は相手が最後にページを更新した時刻の新しい順。既定（追加順）は
  // フォローした順（配列は新規を先頭にunshiftしているためそのまま）。
  const shown =
    sort === "updated"
      ? [...filtered].sort(
          (a, b) => followTime(b, states[b.handle]) - followTime(a, states[a.handle]),
        )
      : filtered;
  const updates = follows.filter((f) => {
    const st = states[f.handle]?.state;
    return st === "new" || st === "changed" || st === "deleted";
  }).length;

  // 「フォロワー」タブを開き、かつログイン済みで未取得のときに一覧を読み込む。
  // 依存は mode / loggedIn のみ。followers や followersLoading を依存に入れると、
  // effect 内の setState でこの effect 自身が再実行され、クリーンアップが進行中の
  // 取得を cancel してしまい「読み込み中」のまま固まる（未取得判定は本体内で行う）。
  useEffect(() => {
    if (mode !== "followers" || !loggedIn || followers !== null) return;
    let cancelled = false;
    setFollowersLoading(true);
    setFollowersError("");
    onLoadFollowers()
      .then((rows) => {
        if (!cancelled) setFollowers(rows);
      })
      .catch(() => {
        if (!cancelled) setFollowersError("フォロワーを読み込めませんでした。通信状況をご確認ください");
      })
      .finally(() => {
        if (!cancelled) setFollowersLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, loggedIn]);

  // ログアウトしたらキャッシュを破棄し、別アカウントで開いたとき前のフォロワーが
  // 残らないようにする（再ログイン時に取り直す）。
  useEffect(() => {
    if (!loggedIn) {
      setFollowers(null);
      setFollowersError("");
      setFollowersLoading(false);
    }
  }, [loggedIn]);

  async function runSearch(raw: string) {
    const input = raw.trim();
    setFound(null);
    setTagResults([]);
    if (input.startsWith("#")) {
      const tag = input.replace(/^#+/, "");
      if (!/^[\p{L}\p{N}_]{1,20}$/u.test(tag)) {
        setSearchMessage("タグを1〜20文字で入力してください");
        return;
      }
      setSearching(true);
      setSearchMessage("");
      try {
        const response = await fetch(`/api/user-search?tag=${encodeURIComponent(tag)}`, { cache: "no-store" });
        if (response.status === 429) {
          setSearchMessage("検索回数が多すぎます。しばらく待ってからお試しください");
          return;
        }
        if (!response.ok) throw new Error("search failed");
        const rows = (await response.json()) as FollowerRow[];
        setTagResults(rows);
        if (!rows.length) setSearchMessage("このタグのユーザーはまだいません");
      } catch {
        setSearchMessage("検索できませんでした。通信状況をご確認ください");
      } finally {
        setSearching(false);
      }
      return;
    }

    const handle = input.replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setSearchMessage("ユーザーID、または #タグを入力してください");
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
      if (page) setFound({ handle, page });
      else setSearchMessage("このIDのユーザーは見つかりませんでした");
    } catch {
      setSearchMessage("検索できませんでした。通信状況をご確認ください");
    } finally {
      setSearching(false);
    }
  }

  function searchById(e: React.FormEvent) {
    e.preventDefault();
    void runSearch(q);
  }

  useEffect(() => {
    if (!initialSearch) return;
    setQ(initialSearch);
    void runSearch(initialSearch);
  }, [initialSearch, initialSearchKey]);

  return (
    <section className="view">
      <h1>フォロー</h1>
      <div className="followModeTabs" role="group" aria-label="表示切替">
        <button
          type="button"
          className={mode === "following" ? "on" : ""}
          onClick={() => onModeChange("following")}
          aria-pressed={mode === "following"}
        >
          フォロー中
        </button>
        <button
          type="button"
          className={mode === "followers" ? "on" : ""}
          onClick={() => onModeChange("followers")}
          aria-pressed={mode === "followers"}
        >
          フォロワー
        </button>
      </div>
      {mode === "followers" ? (
        <FollowersPane
          loggedIn={loggedIn}
          followers={followers}
          loading={followersLoading}
          error={followersError}
          followingSet={followingSet}
          onOpen={(f) => onOpenProfile(followerToSnapshot(f))}
          onLoginPrompt={onLoginPrompt}
        />
      ) : (
      <>
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
            setTagResults([]);
            setSearchMessage("");
          }}
          placeholder="ユーザーID / #ハッシュタグ"
        />
        <button type="submit" disabled={searching}>
          {searching ? "検索中" : "検索"}
        </button>
      </form>
      <div className="searchHint">IDの完全一致、または #タグで検索できます。</div>
      {searchMessage && <div className="searchMessage">{searchMessage}</div>}
      {found && (
        <div
          className="card userSearchResult"
          role="link"
          tabIndex={0}
          onClick={() => onOpenProfile(toSnapshot(found.page.profile, found.page.channels, found.page.cal))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenProfile(toSnapshot(found.page.profile, found.page.channels, found.page.cal));
            }
          }}
        >
          <div
            className="av"
            style={!found.page.profile.av_url ? { background: grad(found.page.profile.av_theme ?? 0) } : undefined}
          >
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
      {tagResults.length > 0 && (
        <div className="tagSearchResults">
          {tagResults.map((row) => (
            <div
              key={row.handle}
              className="card userSearchResult"
              role="link"
              tabIndex={0}
              onClick={() => onOpenProfile(followerToSnapshot(row))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenProfile(followerToSnapshot(row));
                }
              }}
            >
              <div className="av" style={!row.av_url ? { background: grad(row.av_theme ?? 0) } : undefined}>
                {row.av_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.av_url} alt="" loading="lazy" decoding="async" />
                ) : (
                  row.emoji || row.handle[0]?.toUpperCase()
                )}
              </div>
              <div className="who">
                <div className="nm">{row.name || `@${row.handle}`}</div>
                <div className="id">@{row.handle}</div>
              </div>
              <span className="searchResultArrow">→</span>
            </div>
          ))}
        </div>
      )}
      <div className="followListHead">
        <div className="count">
          {follows.length
            ? `${follows.length}人をフォロー中` +
              (updates ? `・${updates}件に更新あり` : "") +
              (query ? `・${shown.length}件` : "")
            : ""}
        </div>
        {follows.length > 1 && (
          <div className="followSort" role="group" aria-label="並び替え">
            <button
              type="button"
              className={sort === "added" ? "on" : ""}
              onClick={() => setSort("added")}
            >
              追加順
            </button>
            <button
              type="button"
              className={sort === "updated" ? "on" : ""}
              onClick={() => setSort("updated")}
            >
              更新順
            </button>
          </div>
        )}
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
                  onClick={() => onOpenProfile(f)}
                  onKeyDown={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenProfile(f);
                    }
                  }}
                >
                  <div className="avWrap">
                    <div
                      className="av"
                      style={!f.av_url ? { background: grad(f.av_theme ?? 0) } : undefined}
                    >
                      {f.av_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.av_url} alt="" loading="lazy" decoding="async" />
                      ) : (
                        f.emoji || f.handle[0]?.toUpperCase()
                      )}
                    </div>
                    {(st.state === "new" || st.state === "changed" || st.state === "deleted") && (
                      <span
                        className={`followAvLamp ${st.state === "deleted" ? "deleted" : ""}`}
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="who">
                    <div className="nm">{f.name || `@${f.handle}`}</div>
                    <div className="id">@{f.handle}</div>
                    <FollowBadge st={st} />
                    <div className="st">
                      <b>{live}件のリンク</b>
                      ・{ago(followTime(f, st))}
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
      </>
      )}
    </section>
  );
}

/** フォロワー一覧タブ。本人だけが自分のフォロワーを見られる。 */
function FollowersPane({
  loggedIn,
  followers,
  loading,
  error,
  followingSet,
  onOpen,
  onLoginPrompt,
}: {
  loggedIn: boolean;
  followers: FollowerRow[] | null;
  loading: boolean;
  error: string;
  followingSet: Set<string>;
  onOpen: (f: FollowerRow) => void;
  onLoginPrompt: () => void;
}) {
  if (!loggedIn) {
    return (
      <div className="note" style={{ marginTop: 12 }}>
        フォロワーの一覧はログインすると表示できます。{' '}
        <button type="button" className="textlink" onClick={onLoginPrompt}>
          ログイン
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="followListHead">
        <div className="count">
          {followers && followers.length ? `${followers.length}人のフォロワー` : ""}
        </div>
      </div>
      <div className="card" style={{ padding: "4px 14px" }}>
        <div>
          {loading && followers === null ? (
            <div className="empty">読み込み中…</div>
          ) : error ? (
            <div className="empty">{error}</div>
          ) : !followers || !followers.length ? (
            <div className="empty">まだフォロワーはいません。</div>
          ) : (
            followers.map((f) => {
              const mutual = followingSet.has(f.handle.toLowerCase());
              return (
                <div
                  key={f.handle}
                  className="frow"
                  role="link"
                  tabIndex={0}
                  onClick={() => onOpen(f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(f);
                    }
                  }}
                >
                  <div className="avWrap">
                    <div
                      className="av"
                      style={!f.av_url ? { background: grad(f.av_theme ?? 0) } : undefined}
                    >
                      {f.av_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.av_url} alt="" loading="lazy" decoding="async" />
                      ) : (
                        f.emoji || f.handle[0]?.toUpperCase()
                      )}
                    </div>
                  </div>
                  <div className="who">
                    <div className="nm">{f.name || `@${f.handle}`}</div>
                    <div className="id">@{f.handle}</div>
                    {mutual && <span className="followLamp mutual">相互フォロー</span>}
                  </div>
                  <span className="searchResultArrow">→</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

function FollowBadge({ st }: { st: FollowStatus }) {
  // ドットはアバター左上のランプ(.followAvLamp)に集約し、ここは説明ラベルだけにする。
  if (st.state === "new") {
    return (
      <span className="followLamp new">
        新しい連絡先{st.addedLive > 1 ? ` +${st.addedLive}` : ""}
      </span>
    );
  }
  if (st.state === "changed") {
    return <span className="followLamp changed">更新あり</span>;
  }
  if (st.state === "deleted") {
    return <span className="followLamp deleted">削除ずみ</span>;
  }
  return null;
}
