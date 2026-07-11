"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createAccount,
  deleteAccount as rpcDeleteAccount,
  getClicks,
  getPrivateCal,
  getPublicPage,
  resetPass,
  saveCal as rpcSaveCal,
  saveChannels as rpcSaveChannels,
  updateProfile,
  verifyLogin,
} from "@/lib/beacon/rpc";
import { uploadImage } from "@/lib/beacon/storage";
import type { CalMemo, Channel } from "@/lib/beacon/types";
import { normalizeRecoveryCode } from "@/lib/beacon/format";
import { addHandle, loadHandles, removeHandle } from "@/lib/beacon/accounts";
import {
  addFollow,
  diffFollow,
  type FollowSnapshot,
  type FollowStatus,
  K_HANDLE,
  loadFollows,
  removeFollow,
  toSnapshot,
} from "@/lib/beacon/follows";
import {
  type CalMap,
  emptyProfile,
  ensureIds,
  type Me,
  type Session,
} from "./appTypes";

type NavTab = "profile" | "follows" | "howto";
type Overlay = "none" | "auth" | "public";
import { AuthView } from "./AuthView";
import { LandingView } from "./LandingView";
import { ProfileView } from "./ProfileView";
import { ProfileEdit, type EditResult } from "./ProfileEdit";
import { FollowsView } from "./FollowsView";
import { HowtoView } from "./HowtoView";
import {
  CreateYoursFooter,
  PublicProfileCard,
  type PublicCardData,
} from "./PublicProfileCard";

/**
 * Beacon クライアントアプリ本体。beacon.html の SPA を Next.js のクライアント
 * コンポーネントとして再構成したもの。
 *
 * セッション方式（合意済み: 方式a）:
 *   - パスコードは session state（メモリ）だけに持ち、localStorage には保存しない。
 *   - localStorage には handle のみ控え、リロード後は「ログイン」で再入力させる。
 *   - すべての書込RPCに毎回 session.pass を渡してサーバー検証する。
 */

function publicMemos(cal: CalMap): CalMemo[] {
  return Object.entries(cal)
    .filter(([, v]) => v.pub && v.memo)
    .map(([d, v]) => ({ d, memo: v.memo }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

function writeErrorMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (m.includes("locked"))
    return "試行回数が多すぎます。約15分後にお試しください";
  if (m.includes("auth")) return "パスコードが無効です。再度ログインしてください";
  return "保存に失敗しました。通信状況をご確認ください";
}

export function BeaconApp() {
  const db = useMemo(() => createClient(), []);

  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [navTab, setNavTab] = useState<NavTab>("profile");
  // 全画面オーバーレイ（ナビを隠す）: 認証フォーム / 公開プレビュー
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [editing, setEditing] = useState(false);
  const [rcPlain, setRcPlain] = useState<string | null>(null);
  const [follows, setFollows] = useState<FollowSnapshot[]>([]);
  const [followStates, setFollowStates] = useState<
    Record<string, FollowStatus>
  >({});
  const [preview, setPreview] = useState<PublicCardData | null>(null);

  const [authInitialHandle, setAuthInitialHandle] = useState("");
  const [authInitialPane, setAuthInitialPane] = useState<"create" | "login">(
    "create",
  );
  // この端末で使ったID一覧（複数プロフィールの切替チップ用）
  const [knownHandles, setKnownHandles] = useState<string[]>([]);

  // トースト
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 2400);
  }, []);

  const calLoading = useRef(false);

  // 起動: フォロー一覧を読み込み、控えた handle があればログインのプリフィルに使う。
  // ログインは要求せず、ナビ（フォロー中/使い方）は最初から使える。
  useEffect(() => {
    const loaded = loadFollows();
    setFollows(loaded);
    setKnownHandles(loadHandles());
    let stored = "";
    try {
      stored = window.localStorage.getItem(K_HANDLE) ?? "";
    } catch {
      /* noop */
    }
    if (stored) {
      setAuthInitialHandle(stored);
      setAuthInitialPane("login");
    }
    setBooting(false);
  }, []);

  // ---- データ読み込み ----
  const loadMe = useCallback(
    async (handle: string, pass: string): Promise<Me> => {
      const page = await getPublicPage(db, handle);
      // カレンダーもログイン時に読み込んでおく（プレビュー/自己フォローの
      // スナップショットが公開メモを正しく含むように）。公開分は get_public_page に
      // 含まれるので、非公開分だけ追加取得する。失敗時は calLoaded=false で遅延ロードへ。
      const cal: CalMap = {};
      let calLoaded = false;
      let clicks: Record<string, number> = {};
      (page?.cal ?? []).forEach((e) => (cal[e.d] = { memo: e.memo, pub: true }));
      try {
        const [privList, clickMap] = await Promise.all([
          getPrivateCal(db, handle, pass),
          getClicks(db, handle, pass).catch(() => ({})),
        ]);
        privList.forEach((e) => (cal[e.d] = { memo: e.memo, pub: false }));
        clicks = clickMap;
        calLoaded = true;
      } catch {
        calLoaded = false;
      }
      return {
        profile: page?.profile ?? emptyProfile(handle),
        channels: ensureIds(page?.channels ?? []),
        cal,
        calLoaded,
        clicks,
      };
    },
    [db],
  );

  function persistHandle(handle: string) {
    try {
      window.localStorage.setItem(K_HANDLE, handle);
    } catch {
      /* noop */
    }
    setKnownHandles(addHandle(handle)); // 切替チップ用に控える
  }

  // ---- 認証アクション ----
  const doCreate = useCallback(
    async (handle: string, pass: string): Promise<string> => {
      const rc = await createAccount(db, handle, pass);
      setSession({ handle, pass });
      setRcPlain(rc);
      persistHandle(handle);
      setMe(await loadMe(handle, pass));
      return rc;
    },
    [db, loadMe],
  );

  const doLogin = useCallback(
    async (handle: string, pass: string): Promise<void> => {
      const ok = await verifyLogin(db, handle, pass);
      if (!ok) throw new Error("auth");
      setSession({ handle, pass });
      persistHandle(handle);
      setMe(await loadMe(handle, pass));
      setOverlay("none");
      setNavTab("profile");
      setEditing(false);
      toast("ログインしました");
    },
    [db, loadMe, toast],
  );

  const doReset = useCallback(
    async (handle: string, code: string, newPass: string): Promise<void> => {
      await resetPass(db, handle, normalizeRecoveryCode(code), newPass);
    },
    [db],
  );

  const enterAfterCreate = useCallback(() => {
    setOverlay("none");
    setNavTab("profile");
    setEditing(false);
    toast("作成しました");
  }, [toast]);

  const logout = useCallback(() => {
    const last = session?.handle ?? "";
    setSession(null);
    setMe(null);
    setRcPlain(null);
    setEditing(false);
    setPreview(null);
    try {
      window.localStorage.removeItem(K_HANDLE);
    } catch {
      /* noop */
    }
    setAuthInitialHandle(last);
    setAuthInitialPane("login");
    setOverlay("none");
    setNavTab("profile"); // ログアウト後はランディング（プロフィールタブ）へ
  }, [session]);

  /** 認証フォームを開く（ランディングのボタンから）。 */
  const openAuth = useCallback((pane: "create" | "login") => {
    setAuthInitialPane(pane);
    setOverlay("auth");
  }, []);

  // ---- 書込ヘルパー ----
  const runWrite = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      try {
        await fn();
        return true;
      } catch (e) {
        toast(writeErrorMessage(e));
        if (String((e as { message?: string })?.message ?? e).includes("auth")) {
          logout();
        }
        return false;
      }
    },
    [toast, logout],
  );

  const persistChannels = useCallback(
    async (next: Channel[]): Promise<boolean> => {
      if (!session || !me) return false;
      const prev = me.channels;
      setMe((m) => (m ? { ...m, channels: next } : m));
      const ok = await runWrite(() =>
        rpcSaveChannels(db, session.handle, session.pass, next),
      );
      if (!ok) setMe((m) => (m ? { ...m, channels: prev } : m));
      return ok;
    },
    [db, session, me, runWrite],
  );

  const persistCal = useCallback(
    async (date: string, memo: string, pub: boolean): Promise<boolean> => {
      if (!session) return false;
      const ok = await runWrite(() =>
        rpcSaveCal(db, session.handle, session.pass, date, memo, pub),
      );
      if (ok) {
        setMe((m) => {
          if (!m) return m;
          const cal = { ...m.cal };
          if (memo) cal[date] = { memo, pub };
          else delete cal[date];
          return { ...m, cal };
        });
      }
      return ok;
    },
    [db, session, runWrite],
  );

  const loadCal = useCallback(async () => {
    if (!session || !me || me.calLoaded || calLoading.current) return;
    calLoading.current = true;
    try {
      const [page, privList] = await Promise.all([
        getPublicPage(db, session.handle),
        getPrivateCal(db, session.handle, session.pass),
      ]);
      const cal: CalMap = {};
      (page?.cal ?? []).forEach((e) => (cal[e.d] = { memo: e.memo, pub: true }));
      privList.forEach((e) => (cal[e.d] = { memo: e.memo, pub: false }));
      setMe((m) => (m ? { ...m, cal, calLoaded: true } : m));
    } catch {
      toast("カレンダーの読み込みに失敗しました");
    } finally {
      calLoading.current = false;
    }
  }, [db, session, me, toast]);

  const saveProfile = useCallback(
    async (edit: EditResult): Promise<void> => {
      if (!session || !me) return;
      const prof = me.profile;
      try {
        let av_url = prof.av_url;
        let bn_url = prof.bn_url;
        if (edit.av.mode === "new" && edit.av.file)
          av_url = await uploadImage(db, session.handle, "av", edit.av.file);
        else if (edit.av.mode === "remove") av_url = "";
        if (edit.bn.mode === "new" && edit.bn.file)
          bn_url = await uploadImage(db, session.handle, "bn", edit.bn.file);
        else if (edit.bn.mode === "remove") bn_url = "";

        const nextProfile = {
          ...prof,
          name: edit.name,
          bio: edit.bio,
          emoji: edit.emoji,
          theme: edit.theme,
          status: edit.status,
          status_at:
            edit.status !== (prof.status ?? "")
              ? new Date().toISOString()
              : prof.status_at,
          av_url,
          bn_url,
        };
        await updateProfile(db, session.handle, session.pass, nextProfile);
        setMe((m) => (m ? { ...m, profile: nextProfile } : m));
        setEditing(false);
        toast("保存しました");
      } catch (e) {
        toast(writeErrorMessage(e));
        if (
          String((e as { message?: string })?.message ?? e).includes("auth")
        ) {
          logout();
        }
      }
    },
    [db, session, me, toast, logout],
  );

  const uploadThumb = useCallback(
    async (file: File): Promise<string> => {
      if (!session) throw new Error("no session");
      return uploadImage(db, session.handle, "thumb", file);
    },
    [db, session],
  );

  const showRc = useCallback(() => {
    if (rcPlain) {
      window.alert(
        "復旧コード:\n\n" +
          rcPlain +
          "\n\n控えを残してください。\n（安全のためサーバーには平文を保存していません。この復旧コードは作成時のみ表示され、次回ログイン以降は再表示できません）",
      );
    } else {
      toast("復旧コードは作成時のみ表示されます（再表示不可）");
    }
  }, [rcPlain, toast]);

  const doDeleteAccount = useCallback(async () => {
    if (!session) return;
    if (
      !window.confirm(
        "本当に退会しますか？\nプロフィール・リンク・カレンダーはすべて削除され、元に戻せません。",
      )
    )
      return;
    const ok = await runWrite(() =>
      rpcDeleteAccount(db, session.handle, session.pass),
    );
    if (ok) {
      try {
        window.localStorage.removeItem(K_HANDLE);
      } catch {
        /* noop */
      }
      setKnownHandles(removeHandle(session.handle));
      setSession(null);
      setMe(null);
      setRcPlain(null);
      setEditing(false);
      setAuthInitialHandle("");
      setAuthInitialPane("create");
      setOverlay("none");
      setNavTab("profile"); // 退会後はランディングへ
      toast("退会しました");
    }
  }, [db, session, runWrite, toast]);

  // ---- プレビュー / フォロー ----
  const openPreview = useCallback(() => {
    if (!me || !session) return;
    setPreview({
      handle: session.handle,
      profile: me.profile,
      channels: me.channels,
      pubcal: publicMemos(me.cal),
    });
    setOverlay("public");
  }, [me, session]);

  // ---- フォローの変化検知（ナビの更新ドットと一覧のバッジを共有）----
  const checkFollows = useCallback(
    async (list: FollowSnapshot[]) => {
      if (!list.length) return;
      setFollowStates((prev) => {
        const next = { ...prev };
        for (const f of list)
          if (!next[f.handle]) next[f.handle] = { state: "loading", addedLive: 0 };
        return next;
      });
      await Promise.all(
        list.map(async (snap) => {
          try {
            const page = await getPublicPage(db, snap.handle);
            setFollowStates((s) => ({ ...s, [snap.handle]: diffFollow(snap, page) }));
          } catch {
            setFollowStates((s) => ({
              ...s,
              [snap.handle]: { state: "same", addedLive: 0 },
            }));
          }
        }),
      );
    },
    [db],
  );

  // 起動時とフォローの顔ぶれ変更時に再チェック（他人がサーバー側で変えた分を検知）
  const followKey = follows.map((f) => f.handle).join(",");
  useEffect(() => {
    if (!followKey) return;
    void checkFollows(follows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followKey, checkFollows]);

  // フォロー中タブを開くたびに最新を取り直す（相手の変更を掴むため）
  useEffect(() => {
    if (navTab === "follows" && follows.length) void checkFollows(follows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTab]);

  const followSelf = useCallback(() => {
    if (!me || !session) return;
    const next = addFollow(
      toSnapshot(me.profile, me.channels, publicMemos(me.cal)),
    );
    setFollows(next);
    toast("フォローしました");
  }, [me, session, toast]);

  const onUnfollow = useCallback(
    (handle: string) => {
      setFollows(removeFollow(handle));
      toast("解除しました");
    },
    [toast],
  );

  const onUpdateSnapshot = useCallback((snap: FollowSnapshot) => {
    setFollows(addFollow(snap));
    setFollowStates((s) => ({
      ...s,
      [snap.handle]: { state: "same", addedLive: 0 },
    }));
  }, []);

  function goNav(v: NavTab) {
    setNavTab(v);
    setEditing(false);
    setOverlay("none");
  }

  if (booting) {
    return (
      <div className="wrap">
        <div className="top">
          <div className="logo">
            Beacon<span className="dot">.</span>
          </div>
        </div>
      </div>
    );
  }

  const selfFollowed = session
    ? follows.some((f) => f.handle === session.handle)
    : false;

  const followUpdates = follows.filter((f) => {
    const st = followStates[f.handle]?.state;
    return st === "new" || st === "changed" || st === "deleted";
  }).length;

  // ナビ（下部タブ）を出すのは通常モードのみ。認証フォーム・プレビュー・
  // プロフィール編集の全画面時は隠す。
  const showNav = overlay === "none" && !editing;

  return (
    <>
      <div className="wrap">
        <div className="top">
          <div className="logo">
            Beacon<span className="dot">.</span>
          </div>
          {session && overlay === "none" && (
            <>
              <div className="tag" onClick={() => openAuth("login")}>
                切替
              </div>
              <div className="tag" style={{ marginLeft: 8 }} onClick={logout}>
                ログアウト
              </div>
            </>
          )}
        </div>

        {/* 全画面: 認証フォーム */}
        {overlay === "auth" && (
          <AuthView
            key={authInitialPane + authInitialHandle}
            initialHandle={authInitialHandle}
            initialPane={authInitialPane}
            onCreate={doCreate}
            onLogin={doLogin}
            onReset={doReset}
            onEnter={enterAfterCreate}
            onBack={() => setOverlay("none")}
            knownHandles={knownHandles}
            toast={toast}
          />
        )}

        {/* 全画面: 公開プレビュー */}
        {overlay === "public" && preview && (
          <section className="view">
            <a className="backlink" onClick={() => setOverlay("none")}>
              ← 戻る
            </a>
            <PublicProfileCard
              data={preview}
              actions={
                <button
                  className="pill solid"
                  disabled={selfFollowed}
                  onClick={followSelf}
                >
                  {selfFollowed ? "フォロー中" : "フォローする"}
                </button>
              }
            />
            <div className="note" style={{ marginTop: 14 }}>
              これはあなたの公開ページ（/@{preview.handle}）のプレビューです。
              相手にはこの見た目で表示されます。
            </div>
            <div style={{ marginTop: 14 }}>
              <CreateYoursFooter href={`/@${preview.handle}`} />
            </div>
          </section>
        )}

        {/* 通常モード: プロフィール / フォロー中 / 使い方 */}
        {overlay === "none" && navTab === "profile" && (
          session && me ? (
            editing ? (
              <ProfileEdit
                profile={me.profile}
                onCancel={() => setEditing(false)}
                onSave={saveProfile}
              />
            ) : (
              <>
                <ProfileView
                  me={me}
                  handle={session.handle}
                  onEdit={() => setEditing(true)}
                  onPreview={openPreview}
                  onShowRc={showRc}
                  onSaveChannels={persistChannels}
                  onSaveCal={persistCal}
                  onLoadCal={loadCal}
                  onUploadThumb={uploadThumb}
                  toast={toast}
                />
                <button
                  className="btn ghost"
                  style={{ marginTop: 10, color: "var(--alert)" }}
                  onClick={doDeleteAccount}
                >
                  退会（アカウントを削除）
                </button>
              </>
            )
          ) : (
            <LandingView
              onCreate={() => openAuth("create")}
              onLogin={() => openAuth("login")}
            />
          )
        )}

        {overlay === "none" && navTab === "follows" && (
          <FollowsView
            follows={follows}
            states={followStates}
            onUnfollow={onUnfollow}
            onUpdateSnapshot={onUpdateSnapshot}
            loggedIn={!!session}
            onLoginPrompt={() => openAuth("login")}
          />
        )}

        {overlay === "none" && navTab === "howto" && <HowtoView />}
      </div>

      {showNav && (
        <div className="nav">
          <button
            className={`ni ${navTab === "profile" ? "on" : ""}`}
            onClick={() => goNav("profile")}
          >
            <span className="i">👤</span>プロフィール
          </button>
          <button
            className={`ni ${navTab === "follows" ? "on" : ""}`}
            onClick={() => goNav("follows")}
            style={{ position: "relative" }}
          >
            <span className="i">📋</span>フォロー中
            {followUpdates > 0 && (
              <span
                aria-label={`${followUpdates}件の更新`}
                style={{
                  position: "absolute",
                  top: 2,
                  right: "50%",
                  marginRight: -18,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "var(--alert)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  lineHeight: "16px",
                  textAlign: "center",
                }}
              >
                {followUpdates}
              </span>
            )}
          </button>
          <button
            className={`ni ${navTab === "howto" ? "on" : ""}`}
            onClick={() => goNav("howto")}
          >
            <span className="i">❓</span>使い方
          </button>
        </div>
      )}

      <div className={`toast ${toastOn ? "show" : ""}`}>{toastMsg}</div>
    </>
  );
}
