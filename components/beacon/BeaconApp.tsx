"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createPasskeySession,
  deleteAccount as rpcDeleteAccount,
  deleteSession,
  finalizePasskeyAccount,
  getAccountSecurity,
  getClicks,
  getMyFollows,
  getPrivateCal,
  getPublicPage,
  saveMyFollows,
  saveCal as rpcSaveCal,
  saveChannels as rpcSaveChannels,
  updateProfile,
  verifyAppSession,
} from "@/lib/beacon/rpc";
import { uploadImage } from "@/lib/beacon/storage";
import { registerPasskeyForHandle } from "@/lib/beacon/passkey";
import type { Channel } from "@/lib/beacon/types";
import {
  clearTrustedDevice,
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
import { RecoverySetup } from "./RecoverySetup";

/**
 * Beacon クライアントアプリ本体。beacon.html の SPA を Next.js のクライアント
 * コンポーネントとして再構成したもの。
 *
 * Supabase Authがパスキーを検証し、アプリ内では失効可能なbst_セッションを使う。
 * パスワードは通常の登録・ログイン導線では扱わない。
 */

type NavTab = "profile" | "follows" | "help";
type Overlay = "none" | "auth";

function NavIcon({ name }: { name: NavTab }) {
  const path =
    name === "profile"
      ? "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z"
      : name === "follows"
        ? "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
        : "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.1 9a3 3 0 1 1 4.3 2.7c-.9.5-1.4 1.1-1.4 2.3M12 18h.01";
  return (
    <svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function writeErrorMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (m.includes("locked"))
    return "試行回数が多すぎます。約15分後にお試しください";
  if (m.includes("auth")) return "ログインが無効です。パスキーで再度ログインしてください";
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
  const [editTarget, setEditTarget] = useState<"profile" | "links" | "cal">("profile");
  const [recoveryFocusRequest, setRecoveryFocusRequest] = useState(0);
  const [recoveryHighlighted, setRecoveryHighlighted] = useState(false);
  const recoverySetupRef = useRef<HTMLDivElement | null>(null);
  const recoveryHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  function openEditor(target: "profile" | "links" | "cal" = "profile") {
    setEditTarget(target);
    setEditing(true);
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "howto" || requested === "settings") setNavTab("help");
    else if (requested && ["profile", "follows", "help"].includes(requested)) setNavTab(requested as NavTab);
  }, []);

  const [authInitialHandle, setAuthInitialHandle] = useState("");
  const [authInitialPane, setAuthInitialPane] = useState<"create" | "login" | "recover">(
    "create",
  );
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
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

      // 保存セッションのネットワーク確認で初期画面をブロックしない。通信が遅い・
      // オフラインでも、まずランディングとナビを操作できる状態にする。
      if (!cancelled) setBooting(false);

      const saved = loadStoredSession();
      if (saved && !cancelled) {
        try {
          await doTokenLogin(saved.handle, saved.token, true);
        } catch {
          clearStoredSession(); // 失効・削除済みアカウント等
        }
      } else {
        // 旧方式はパスコードを端末に難読化保存しており、IndexedDBの応答待ちで
        // 起動が止まることもある。現行ユーザーはトークン方式なので読み込まず破棄する。
        clearTrustedDevice();
      }
    })();
    return () => {
      cancelled = true;
    };
    // 初回マウント時のみ実行（doTokenLogin は同一レンダー内で以降に定義される）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("recover") !== "1") return;
    void db.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      setRecoverySessionReady(true);
      setAuthInitialPane("recover");
      setOverlay("auth");
    });
  }, [db]);

  // ---- データ読み込み ----
  const loadMe = useCallback(
    async (handle: string, pass: string): Promise<Me> => {
      const page = await getPublicPage(db, handle);
      // カレンダーもログイン時に読み込んでおく（プレビュー/自己フォローの
      // スナップショットが公開メモを正しく含むように）。公開分は get_public_page に
      // 含まれるので、非公開分だけ追加取得する。失敗時は calLoaded=false で遅延ロードへ。
      const cal: CalMap = {};
      let calLoaded = false;
      const clicksPromise = getClicks(db, handle, pass).catch(() => ({}));
      const securityPromise = getAccountSecurity(db, handle, pass).catch(() => ({
        passkey_linked: false,
        recovery_verified: false,
        recovery_kind: null,
        recovery_email_masked: null,
      }));
      (page?.cal ?? []).forEach((e) => (cal[e.d] = { memo: e.memo, pub: true }));
      try {
        const privList = await getPrivateCal(db, handle, pass);
        privList.forEach((e) => (cal[e.d] = { memo: e.memo, pub: false }));
        calLoaded = true;
      } catch {
        calLoaded = false;
      }
      const security = await securityPromise;
      return {
        profile: page?.profile ?? emptyProfile(handle),
        followerCount: page?.follower_count ?? 0,
        channels: ensureIds(page?.channels ?? []),
        cal,
        calLoaded,
        clicks: await clicksPromise,
        passkeyLinked: security.passkey_linked,
        recoveryVerified: security.recovery_verified,
        recoveryKind: security.recovery_kind,
        recoveryEmailMasked: security.recovery_email_masked,
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
  const finishAppLogin = useCallback(
    async (handle: string, token: string, silent = false) => {
      storeSession(handle, token);
      setSession({ handle, pass: token });
      setFollows(loadFollows(handle));
      persistHandle(handle);
      setMe(await loadMe(handle, token));
      void syncFollowsFromServer(handle, token);
      setOverlay("none");
      setNavTab("profile");
      setEditing(false);
      if (!silent) toast("ログインしました");
    },
    [loadMe, syncFollowsFromServer, toast],
  );

  const doTokenLogin = useCallback(
    async (handle: string, token: string, silent = false) => {
      if (!await verifyAppSession(db, handle, token)) throw new Error("auth");
      await finishAppLogin(handle, token, silent);
    },
    [db, finishAppLogin],
  );

  const bootstrapPasskey = useCallback(
    async (handle: string) => {
      const { data, error } = await db.functions.invoke("create-passkey-user", {
        body: { handle },
      });
      const tokenHash = (data as { tokenHash?: string; error?: string } | null)?.tokenHash;
      if (error || !tokenHash) {
        const reason = (data as { error?: string } | null)?.error ?? error?.message ?? "bootstrap failed";
        throw new Error(reason);
      }
      const verified = await db.auth.verifyOtp({ token_hash: tokenHash, type: "signup" });
      if (verified.error) throw verified.error;
      try {
        await registerPasskeyForHandle(db, handle);
        const appSession = await finalizePasskeyAccount(db, handle);
        await db.auth.signOut({ scope: "local" });
        await finishAppLogin(appSession.handle, appSession.token, true);
      } finally {
        await db.auth.signOut({ scope: "local" }).catch(() => {});
      }
    },
    [db, finishAppLogin],
  );

  const doCreate = useCallback(async (handle: string) => {
    await bootstrapPasskey(handle);
    toast("IDを作成しました");
  }, [bootstrapPasskey, toast]);

  const doPasskeyLogin = useCallback(async () => {
    const signedIn = await db.auth.signInWithPasskey();
    if (signedIn.error) throw signedIn.error;
    try {
      const appSession = await createPasskeySession(db);
      await db.auth.signOut({ scope: "local" });
      await finishAppLogin(appSession.handle, appSession.token);
    } finally {
      await db.auth.signOut({ scope: "local" }).catch(() => {});
    }
  }, [db, finishAppLogin]);

  const sendRecoveryCode = useCallback(async (destination: string) => {
    const result = await db.auth.signInWithOtp({
      email: destination,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://via-mi.com/?recover=1",
      },
    });
    if (result.error) throw result.error;
    toast("確認コードを送信しました");
  }, [db, toast]);

  const completeRecovery = useCallback(async () => {
    const sessionResult = await db.auth.getSession();
    if (!sessionResult.data.session) throw new Error("auth");
    try {
      const appSession = await createPasskeySession(db);
      await registerPasskeyForHandle(db, appSession.handle);
      await db.auth.signOut({ scope: "local" });
      setRecoverySessionReady(false);
      window.history.replaceState({}, "", "/");
      await finishAppLogin(appSession.handle, appSession.token, true);
      toast("アカウントを復旧しました");
    } finally {
      await db.auth.signOut({ scope: "local" }).catch(() => {});
    }
  }, [db, finishAppLogin, toast]);

  const reauthenticatePasskey = useCallback(async () => {
    const signedIn = await db.auth.signInWithPasskey();
    if (signedIn.error) throw signedIn.error;
    const appSession = await createPasskeySession(db);
    if (session && appSession.handle !== session.handle) {
      await db.auth.signOut({ scope: "local" });
      throw new Error("別のIDのパスキーが選択されました");
    }
    storeSession(appSession.handle, appSession.token);
    setSession({ handle: appSession.handle, pass: appSession.token });
  }, [db, session]);

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
    clearStoredSession();
    void db.auth.signOut({ scope: "local" }).catch(() => {});
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
          av_theme: edit.avTheme,
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
      const storageKey = `via-mi:follow-notifications:v1:${owner}`;
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

  function goRecoverySetup() {
    goNav("help");
    setRecoveryFocusRequest((request) => request + 1);
  }

  useEffect(() => {
    if (!recoveryFocusRequest || navTab !== "help") return;
    const frame = window.requestAnimationFrame(() => {
      recoverySetupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setRecoveryHighlighted(true);
      if (recoveryHighlightTimer.current) clearTimeout(recoveryHighlightTimer.current);
      recoveryHighlightTimer.current = setTimeout(() => setRecoveryHighlighted(false), 1600);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [navTab, recoveryFocusRequest]);

  useEffect(() => () => {
    if (recoveryHighlightTimer.current) clearTimeout(recoveryHighlightTimer.current);
  }, []);

  function goHome() {
    goNav("profile");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (booting) {
    return (
      <div className="wrap">
        <div className="top">
          <button type="button" className="logo logoButton" onClick={goHome} aria-label="via-mi ホーム">
            via-mi
          </button>
        </div>
      </div>
    );
  }

  const showNav = true;

  return (
    <>
      <div className="wrap">
        <div className="top">
          <button type="button" className="logo logoButton" onClick={goHome} aria-label="via-mi ホーム">
            via-mi
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

        {session && me && !me.recoveryVerified && overlay === "none" && (
          <button type="button" className="recoveryBanner" onClick={goRecoverySetup}>
            <span>未認証</span>
            <span className="recoveryBannerText">復旧用の連絡先を設定</span>
            <b aria-hidden="true">›</b>
          </button>
        )}

        {/* 全画面: 認証フォーム */}
        {overlay === "auth" && (
          <AuthView
            key={authInitialPane + authInitialHandle}
            initialHandle={authInitialHandle}
            initialPane={authInitialPane}
            onCreate={doCreate}
            onLogin={doPasskeyLogin}
            onRecoverySend={sendRecoveryCode}
            onRecoveryComplete={completeRecovery}
            recoverySessionReady={recoverySessionReady}
            onBack={() => setOverlay("none")}
            toast={toast}
          />
        )}

        {/* 通常モード: プロフィール / フォロー中 / 使い方 */}
        {overlay === "none" && navTab === "profile" && (
          session && me ? (
            editing ? (
              <div className="editMode">
                <ProfileEdit
                  profile={me.profile}
                  onCancel={() => setEditing(false)}
                  onSave={saveProfile}
                />
                <ProfileView
                  me={me}
                  handle={session.handle}
                  editing
                  focusSection={editTarget === "profile" ? undefined : editTarget}
                  onEdit={openEditor}
                  onSaveChannels={persistChannels}
                  onSaveCal={persistCal}
                  onLoadCal={loadCal}
                  toast={toast}
                />
              </div>
            ) : (
              <ProfileView
                  me={me}
                  handle={session.handle}
                  onEdit={openEditor}
                  onSaveChannels={persistChannels}
                  onSaveCal={persistCal}
                  onLoadCal={loadCal}
                  toast={toast}
                />
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

        {overlay === "none" && navTab === "help" && <HowtoView />}

        {overlay === "none" && navTab === "help" && (
          <section className="view">
            <div className="card">
              <h2 style={{ margin: "0 0 8px" }}>設定</h2>
              <div className="lead" style={{ marginBottom: 18 }}>アカウントに関する設定です。</div>
              {session ? (
                <div style={{ display: "grid", gap: 14 }}>
                  {me && (
                    <div
                      ref={recoverySetupRef}
                      className={`recoveryTarget ${recoveryHighlighted ? "highlighted" : ""}`}
                    >
                      <RecoverySetup
                        verified={me.recoveryVerified}
                        emailMasked={me.recoveryEmailMasked}
                        onReauthenticate={reauthenticatePasskey}
                        onVerified={(status) => setMe((current) => current ? {
                          ...current,
                          recoveryVerified: status.recovery_verified,
                          recoveryKind: status.recovery_kind,
                          recoveryEmailMasked: status.recovery_email_masked,
                          profile: { ...current.profile, verified: status.recovery_verified },
                        } : current)}
                        toast={toast}
                      />
                    </div>
                  )}
                  <button className="textDangerButton" onClick={doDeleteAccount}>
                    アカウントを削除
                  </button>
                </div>
              ) : (
                <div className="lead">ログインすると設定を変更できます。</div>
              )}
            </div>
          </section>
        )}
      </div>

      {showNav && (
        <nav className="nav" aria-label="メインナビゲーション">
          <button
            className={`ni ${navTab === "profile" ? "on" : ""}`}
            onClick={() => goNav("profile")}
            aria-label="me"
            aria-current={navTab === "profile" ? "page" : undefined}
            style={{ order: 2 }}
          >
            <NavIcon name="profile" />
          </button>
          <button
            className={`ni ${navTab === "follows" ? "on" : ""}`}
            onClick={() => goNav("follows")}
            aria-label="Follow"
            aria-current={navTab === "follows" ? "page" : undefined}
            style={{ position: "relative", order: 1 }}
          >
            <NavIcon name="follows" />
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
            className={`ni ${navTab === "help" ? "on" : ""}`}
            onClick={() => goNav("help")}
            aria-label="Help"
            aria-current={navTab === "help" ? "page" : undefined}
            style={{ order: 3 }}
          >
            <NavIcon name="help" />
          </button>
        </nav>
      )}

      <div className={`toast ${toastOn ? "show" : ""}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  );
}
