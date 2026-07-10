"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createAccount,
  deleteAccount as rpcDeleteAccount,
  getPrivateCal,
  getPublicCal,
  getPublicChannels,
  getPublicProfile,
  resetPass,
  saveCal as rpcSaveCal,
  saveChannels as rpcSaveChannels,
  updateProfile,
  verifyLogin,
} from "@/lib/beacon/rpc";
import { uploadImage } from "@/lib/beacon/storage";
import type { CalMemo, Channel } from "@/lib/beacon/types";
import { normalizeRecoveryCode } from "@/lib/beacon/format";
import {
  addFollow,
  K_HANDLE,
  loadFollows,
  removeFollow,
  toSnapshot,
  type FollowSnapshot,
} from "@/lib/beacon/follows";
import {
  type CalMap,
  emptyProfile,
  ensureIds,
  type Me,
  type Session,
  type View,
} from "./appTypes";
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
  const [view, setView] = useState<View>("auth");
  const [navTab, setNavTab] = useState<"profile" | "follows" | "howto">(
    "profile",
  );
  const [editing, setEditing] = useState(false);
  const [rcPlain, setRcPlain] = useState<string | null>(null);
  const [follows, setFollows] = useState<FollowSnapshot[]>([]);
  const [preview, setPreview] = useState<PublicCardData | null>(null);

  const [authInitialHandle, setAuthInitialHandle] = useState("");
  const [authInitialPane, setAuthInitialPane] = useState<"create" | "login">(
    "create",
  );
  // 初回訪問はランディングを見せる。ハンドルの控えがある再訪者は直接ログインへ。
  const [landing, setLanding] = useState(true);

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

  // 起動: 控えた handle があればログイン画面をプリフィル（自動ログインはしない）
  useEffect(() => {
    setFollows(loadFollows());
    let stored = "";
    try {
      stored = window.localStorage.getItem(K_HANDLE) ?? "";
    } catch {
      /* noop */
    }
    if (stored) {
      setAuthInitialHandle(stored);
      setAuthInitialPane("login");
      setLanding(false); // 再訪者はランディングを飛ばしてログインへ
    }
    setBooting(false);
  }, []);

  const inApp = view !== "auth";

  // ---- データ読み込み ----
  const loadMe = useCallback(
    async (handle: string, pass: string): Promise<Me> => {
      const [profile, channels] = await Promise.all([
        getPublicProfile(db, handle),
        getPublicChannels(db, handle),
      ]);
      // カレンダーもログイン時に読み込んでおく（プレビュー/自己フォローの
      // スナップショットが公開メモを正しく含むように）。失敗しても致命的でないため
      // calLoaded=false のまま返し、カレンダータブ表示時の遅延ロードにフォールバックする。
      let cal: CalMap = {};
      let calLoaded = false;
      try {
        const [pubList, privList] = await Promise.all([
          getPublicCal(db, handle),
          getPrivateCal(db, handle, pass),
        ]);
        pubList.forEach((e) => (cal[e.d] = { memo: e.memo, pub: true }));
        privList.forEach((e) => (cal[e.d] = { memo: e.memo, pub: false }));
        calLoaded = true;
      } catch {
        cal = {};
        calLoaded = false;
      }
      return {
        profile: profile ?? emptyProfile(handle),
        channels: ensureIds(channels),
        cal,
        calLoaded,
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
      setView("profile");
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
    setView("profile");
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
    setView("auth");
  }, [session]);

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
      const [pubList, privList] = await Promise.all([
        getPublicCal(db, session.handle),
        getPrivateCal(db, session.handle, session.pass),
      ]);
      const cal: CalMap = {};
      pubList.forEach((e) => (cal[e.d] = { memo: e.memo, pub: true }));
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
      setSession(null);
      setMe(null);
      setRcPlain(null);
      setEditing(false);
      setAuthInitialHandle("");
      setAuthInitialPane("create");
      setLanding(true); // 退会後は最初のランディングへ
      setView("auth");
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
    setView("public");
  }, [me, session]);

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

  function goNav(v: "profile" | "follows" | "howto") {
    setNavTab(v);
    setView(v);
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

  return (
    <>
      <div className="wrap">
        <div className="top">
          <div className="logo">
            Beacon<span className="dot">.</span>
          </div>
          {inApp && (
            <div className="tag" onClick={logout}>
              ログアウト
            </div>
          )}
        </div>

        {view === "auth" &&
          (landing ? (
            <LandingView
              onCreate={() => {
                setAuthInitialPane("create");
                setLanding(false);
              }}
              onLogin={() => {
                setAuthInitialPane("login");
                setLanding(false);
              }}
            />
          ) : (
            <AuthView
              key={authInitialPane + authInitialHandle}
              initialHandle={authInitialHandle}
              initialPane={authInitialPane}
              onCreate={doCreate}
              onLogin={doLogin}
              onReset={doReset}
              onEnter={enterAfterCreate}
              onBack={() => setLanding(true)}
              toast={toast}
            />
          ))}

        {view === "profile" &&
          me &&
          session &&
          (editing ? (
            <ProfileEdit
              profile={me.profile}
              onCancel={() => setEditing(false)}
              onSave={saveProfile}
            />
          ) : (
            <ProfileView
              me={me}
              handle={session.handle}
              onEdit={() => setEditing(true)}
              onPreview={openPreview}
              onShowRc={showRc}
              onSaveChannels={persistChannels}
              onSaveCal={persistCal}
              onLoadCal={loadCal}
              toast={toast}
            />
          ))}

        {view === "follows" && (
          <FollowsView follows={follows} onUnfollow={onUnfollow} />
        )}

        {view === "howto" && <HowtoView />}

        {view === "public" && preview && (
          <section className="view">
            <a className="backlink" onClick={() => setView("profile")}>
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

        {view === "profile" && me && session && !editing && (
          <button
            className="btn ghost"
            style={{ marginTop: 10, color: "var(--alert)" }}
            onClick={doDeleteAccount}
          >
            退会（アカウントを削除）
          </button>
        )}
      </div>

      {inApp && view !== "public" && (
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
          >
            <span className="i">📋</span>フォロー中
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
