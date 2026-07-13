"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createAccount,
  createSession,
  deleteAccount as rpcDeleteAccount,
  deleteSession,
  getClicks,
  getMyFollows,
  getPrivateCal,
  getPublicPage,
  reissueRecovery,
  resetPass,
  saveMyFollows,
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
  clearTrustedDevice,
  getTrustedSession,
} from "@/lib/beacon/deviceTrust";
import {
  clearStoredSession,
  isSessionToken,
  loadStoredSession,
  storeSession,
} from "@/lib/beacon/session";
import {
  addFollow,
  diffFollow,
  type FollowSnapshot,
  type FollowStatus,
  K_HANDLE,
  loadFollows,
  replaceFollows,
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
 * セッション方式（セッショントークン）:
 *   - ログイン成功時にサーバーが失効可能なトークンを発行し（create_session）、
 *     既定でそれを localStorage に保持する（X/Instagram等と同じ「ログインしっぱなし」）。
 *   - パスコードそのものは端末に保存しない。session.pass にはトークンが入り、
 *     すべての書込RPCにそのまま渡してサーバー検証する（_check_pass が両方受ける）。
 *   - 「ログイン状態を保持する」をオフにした場合はトークンを発行せず、
 *     パスコードをメモリだけに持つ（リロードで再入力。旧方式aと同じ）。
 */

type NavTab = "profile" | "follows" | "howto";
type Overlay = "none" | "auth" | "public";

function NavIcon({ name }: { name: NavTab }) {
  const path =
    name === "profile"
      ? "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
      : name === "follows"
        ? "M6 4h12a2 2 0 0 1 2 2v14l-8-4-8 4V6a2 2 0 0 1 2-2Z"
        : "M9.1 9a3 3 0 1 1 4.3 2.7c-.9.5-1.4 1.1-1.4 2.3M12 18h.01";
  return (
    <svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

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
  const [follows, setFollows] = useState<FollowSnapshot[]>([]);
  const [followStates, setFollowStates] = useState<
    Record<string, FollowStatus>
  >({});
  const followUpdates = useMemo(
    () =>
      follows.filter((follow) => {
        const state = followStates[follow.handle]?.state;
        return state === "new" || state === "changed" || state === "deleted";
      }).length,
    [follows, followStates],
  );
  const [preview, setPreview] = useState<PublicCardData | null>(null);

  const [authInitialHandle, setAuthInitialHandle] = useState("");
  const [authInitialPane, setAuthInitialPane] = useState<"create" | "login">(
    "create",
  );
  // この端末で使ったID一覧（複数プロフィールの切替チップ用）
  const [knownHandles, setKnownHandles] = useState<string[]>([]);

  // 保存状態（「保存したか分からない」不安を解消するための常時表示インジケータ）
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

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

  useEffect(() => {
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const request = followUpdates
      ? badgeNavigator.setAppBadge?.(followUpdates)
      : badgeNavigator.clearAppBadge?.();
    void request?.catch(() => {});
  }, [followUpdates]);

  // 起動: フォロー一覧を読み込み、控えた handle があればログインのプリフィルに使う。
  // ログインは要求せず、ナビ（フォロー中/使い方）は最初から使える。
  // 保存済みセッショントークンがあれば自動ログインする（失効していれば捨てて
  // 通常のログイン画面にフォールバック）。旧「この端末を信頼する」の保存が
  // 残っていた場合は一度だけトークン方式へ移行し、旧保存は必ず破棄する。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = loadFollows(null);
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

      const saved = loadStoredSession();
      if (saved && !cancelled) {
        try {
          await doLogin(saved.handle, saved.token, { silent: true });
        } catch {
          clearStoredSession(); // 失効・削除済みアカウント等
        }
      } else {
        const trusted = await getTrustedSession();
        if (trusted && !cancelled) {
          try {
            await doLogin(trusted.handle, trusted.pass, { silent: true });
          } catch {
            /* 失効・削除済みアカウント等。移行せず捨てるだけ */
          }
          clearTrustedDevice(); // 成否によらず旧方式の保存は破棄（新方式へ片道移行）
        }
      }
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
    // 初回マウント時のみ実行（doLogin は同一レンダー内で以降に定義される）
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        followerCount: page?.follower_count ?? 0,
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

  // フォロー中一覧はサーバーにも保存する（本人のみ読める私的ブックマーク。
  // 横断一覧APIにはしない）。端末を変えても一覧が残るようにする対策。
  // doLogin の依存配列より前で参照するため、doCreate/doLogin より前に定義する。
  const pushFollowsToServer = useCallback(
    (list: FollowSnapshot[]) => {
      if (!session) return;
      void saveMyFollows(
        db,
        session.handle,
        session.pass,
        list.map((f) => f.handle),
      ).catch(() => {
        /* ベストエフォート。失敗しても端末のローカル一覧はそのまま使える */
      });
    },
    [db, session],
  );

  /** ログイン直後にサーバーのID一覧を正本として取り込み、アカウント別キャッシュを作る。 */
  const syncFollowsFromServer = useCallback(
    async (handle: string, pass: string) => {
      try {
        const targets = await getMyFollows(db, handle, pass);
        const local = loadFollows(handle);
        const cached = new Map(local.map((item) => [item.handle, item]));
        const resolved = await Promise.all(
          targets.map(async (target) => {
            try {
              const page = await getPublicPage(db, target);
              return page
                ? toSnapshot(page.profile, page.channels, page.cal)
                : null;
            } catch {
              return cached.get(target) ?? null;
            }
          }),
        );
        const accountFollows = resolved.filter(
          (item): item is FollowSnapshot => item !== null,
        );
        replaceFollows(handle, accountFollows);
        setFollows(accountFollows);
      } catch {
        /* サーバー同期に失敗しても端末のローカル一覧はそのまま使える */
      }
    },
    [db],
  );

  // ---- 認証アクション ----
  /**
   * 認証成功後の秘密情報を確定する。remember 時はサーバーにセッショントークンを
   * 発行させて端末に保持し、以後の全RPCにはパスコードでなくトークンを渡す。
   * トークン発行に失敗してもログイン自体は成立させる（メモリのみ・旧方式a相当）。
   */
  const establishSession = useCallback(
    async (handle: string, secret: string, remember: boolean): Promise<string> => {
      if (isSessionToken(secret)) {
        storeSession(handle, secret); // 自動ログイン時: 同じトークンを使い続ける
        return secret;
      }
      if (!remember) return secret;
      try {
        const token = await createSession(db, handle, secret);
        storeSession(handle, token);
        return token;
      } catch {
        return secret;
      }
    },
    [db],
  );

  const doCreate = useCallback(
    async (handle: string, pass: string, remember = true): Promise<string> => {
      const rc = await createAccount(db, handle, pass);
      const secret = await establishSession(handle, pass, remember);
      setSession({ handle, pass: secret });
      setFollows(loadFollows(handle));
      persistHandle(handle);
      setMe(await loadMe(handle, secret));
      return rc;
    },
    [db, loadMe, establishSession],
  );

  const doLogin = useCallback(
    async (
      handle: string,
      pass: string,
      opts: { silent?: boolean; remember?: boolean } = {},
    ): Promise<void> => {
      const { silent = false, remember = true } = opts;
      const ok = await verifyLogin(db, handle, pass);
      if (!ok) throw new Error("auth");
      const secret = await establishSession(handle, pass, remember);
      setSession({ handle, pass: secret });
      setFollows(loadFollows(handle));
      persistHandle(handle);
      setMe(await loadMe(handle, secret));
      void syncFollowsFromServer(handle, secret); // 端末をまたいだフォロー一覧の統合
      setOverlay("none");
      setNavTab("profile");
      setEditing(false);
      if (!silent) toast("ログインしました");
    },
    [db, loadMe, toast, syncFollowsFromServer, establishSession],
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
    // サーバー側のセッションも失効させる（ベストエフォート）
    if (session && isSessionToken(session.pass)) {
      void deleteSession(db, session.handle, session.pass).catch(() => {});
    }
    setSession(null);
    setMe(null);
    setFollows(loadFollows(null));
    setEditing(false);
    setPreview(null);
    clearStoredSession();
    clearTrustedDevice(); // 旧方式の保存が残っていれば併せて解除
    try {
      window.localStorage.removeItem(K_HANDLE);
    } catch {
      /* noop */
    }
    setAuthInitialHandle(last);
    setAuthInitialPane("login");
    setOverlay("none");
    setNavTab("profile"); // ログアウト後はランディング（プロフィールタブ）へ
  }, [db, session]);

  /** 認証フォームを開く（ランディングのボタンから）。 */
  const openAuth = useCallback((pane: "create" | "login") => {
    setAuthInitialPane(pane);
    setOverlay("auth");
  }, []);

  // ---- 書込ヘルパー ----
  // 「保存したか分からない」不安への対策: 全ての書込を通し、状態を常時インジケータに反映する。
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runWrite = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      setSaveStatus("saving");
      try {
        await fn();
        setSaveStatus("saved");
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
        saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
        return true;
      } catch (e) {
        setSaveStatus("error");
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
      setSaveStatus("saving");
      try {
        let av_url = prof.av_url;
        let bn_url = prof.bn_url;
        if (edit.av.mode === "new" && edit.av.file)
          av_url = await uploadImage(db, session.handle, session.pass, "av", edit.av.file);
        else if (edit.av.mode === "remove") av_url = "";
        if (edit.bn.mode === "new" && edit.bn.file)
          bn_url = await uploadImage(db, session.handle, session.pass, "bn", edit.bn.file);
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
        setSaveStatus("saved");
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
        saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
        toast("保存しました");
      } catch (e) {
        setSaveStatus("error");
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
      return uploadImage(db, session.handle, session.pass, "thumb", file);
    },
    [db, session],
  );

  /** 復旧コードの再発行（要パスコード）。古いコードは無効になり新しいものだけ使える。 */
  const reissueRc = useCallback(async (): Promise<string> => {
    if (!session) throw new Error("no session");
    return reissueRecovery(db, session.handle, session.pass);
  }, [db, session]);

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
      clearStoredSession(); // セッションはDB側でcascade削除済み。端末側も破棄
      clearTrustedDevice(); // 旧方式の保存が残っていれば併せて破棄
      setKnownHandles(removeHandle(session.handle));
      setSession(null);
      setMe(null);
      setEditing(false);
      setAuthInitialHandle("");
      setAuthInitialPane("create");
      setOverlay("none");
      setNavTab("profile"); // 退会後はランディングへ
      toast("退会しました");
    }
  }, [db, session, runWrite, toast]);

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
      const entries = await Promise.all(
        list.map(async (snap) => {
          try {
            const page = await getPublicPage(db, snap.handle);
            return [snap.handle, diffFollow(snap, page)] as const;
          } catch {
            return [
              snap.handle,
              { state: "same", addedLive: 0 } as FollowStatus,
            ] as const;
          }
        }),
      );
      setFollowStates(Object.fromEntries(entries));

      const changed = entries.filter(([, status]) =>
        ["new", "changed", "deleted"].includes(status.state),
      );
      const owner = session?.handle ?? "guest";
      const storageKey = `myideal:follow-notifications:v1:${owner}`;
      const fingerprint = JSON.stringify(
        changed.map(([handle, status]) => ({
          handle,
          state: status.state,
          added: status.addedLive,
          name: status.fresh?.name,
          channels: status.fresh?.channels,
          pubcal: status.fresh?.pubcal,
        })),
      );
      try {
        const previous = window.localStorage.getItem(storageKey) ?? "";
        if (changed.length && fingerprint !== previous) {
          toast(`フォロー中に${changed.length}件の更新があります`);
          window.localStorage.setItem(storageKey, fingerprint);
        } else if (!changed.length) {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        if (changed.length) toast(`フォロー中に${changed.length}件の更新があります`);
      }
    },
    [db, session, toast],
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
      session.handle,
    );
    setFollows(next);
    pushFollowsToServer(next);
    toast("フォローしました");
  }, [me, session, toast, pushFollowsToServer]);

  const onUnfollow = useCallback(
    (handle: string) => {
      const next = removeFollow(handle, session?.handle ?? null);
      setFollows(next);
      pushFollowsToServer(next);
      toast("解除しました");
    },
    [session, toast, pushFollowsToServer],
  );

  const onUpdateSnapshot = useCallback(
    (snap: FollowSnapshot) => {
      const next = addFollow(snap, session?.handle ?? null);
      setFollows(next);
      pushFollowsToServer(next);
      setFollowStates((s) => ({
        ...s,
        [snap.handle]: { state: "same", addedLive: 0 },
      }));
    },
    [session, pushFollowsToServer],
  );

  function goNav(v: NavTab) {
    setNavTab(v);
    setEditing(false);
    setOverlay("none");
  }

  function goHome() {
    goNav("profile");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (booting) {
    return (
      <div className="wrap">
        <div className="top">
          <button type="button" className="logo logoButton" onClick={goHome} aria-label="ホームへ戻る">
            my-IDeal<span className="dot">.</span>
          </button>
        </div>
      </div>
    );
  }

  const selfFollowed = session
    ? follows.some((f) => f.handle === session.handle)
    : false;

  // ナビ（下部タブ）を出すのは通常モードのみ。認証フォーム・プレビュー・
  // プロフィール編集の全画面時は隠す。
  const showNav = overlay === "none" && !editing;

  return (
    <>
      <div className="wrap">
        <div className="top">
          <button type="button" className="logo logoButton" onClick={goHome} aria-label="ホームへ戻る">
            my-IDeal<span className="dot">.</span>
          </button>
          {session && overlay === "none" && saveStatus !== "idle" && (
            <span
              style={{
                marginLeft: "auto",
                marginRight: 10,
                fontSize: 11,
                fontWeight: 700,
                color:
                  saveStatus === "error"
                    ? "var(--alert)"
                    : saveStatus === "saving"
                      ? "var(--muted)"
                      : "var(--emd)",
              }}
            >
              {saveStatus === "saving" && "保存中…"}
              {saveStatus === "saved" && "保存済み ✓"}
              {saveStatus === "error" && "保存できませんでした"}
            </span>
          )}
          {session && overlay === "none" && (
            <>
              <button type="button" className="tag" onClick={() => openAuth("login")}>
                切替
              </button>
              <button type="button" className="tag" style={{ marginLeft: 8 }} onClick={logout}>
                ログアウト
              </button>
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
            <button type="button" className="backlink" onClick={() => setOverlay("none")}>
              ← 戻る
            </button>
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
            <div className="previewLabel">公開ページのプレビュー</div>
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
                  onReissueRc={reissueRc}
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
        <nav className="nav" aria-label="メインナビゲーション">
          <button
            className={`ni ${navTab === "profile" ? "on" : ""}`}
            onClick={() => goNav("profile")}
            aria-current={navTab === "profile" ? "page" : undefined}
          >
            <NavIcon name="profile" />プロフィール
          </button>
          <button
            className={`ni ${navTab === "follows" ? "on" : ""}`}
            onClick={() => goNav("follows")}
            aria-current={navTab === "follows" ? "page" : undefined}
            style={{ position: "relative" }}
          >
            <NavIcon name="follows" />フォロー中
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
            aria-current={navTab === "howto" ? "page" : undefined}
          >
            <NavIcon name="howto" />使い方
          </button>
        </nav>
      )}

      <div className={`toast ${toastOn ? "show" : ""}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  );
}
