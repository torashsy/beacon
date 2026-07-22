"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  createPasskeySession,
  deleteAccount as rpcDeleteAccount,
  deleteSession,
  finalizePasskeyAccount,
  getAccountSecurity,
  getClicks,
  getMyFollows,
  getMyFollowers,
  type FollowerRow,
  getPagesUpdated,
  getPublicPage,
  getPublicPageCore,
  saveMyFollows,
  saveCal as rpcSaveCal,
  saveChannels as rpcSaveChannels,
  updateProfile,
  updateProfileContent,
  verifyAppSession,
} from "@/lib/beacon/rpc";
import { uploadImage } from "@/lib/beacon/storage";
import { registerPasskeyForHandle } from "@/lib/beacon/passkey";
import type { Channel } from "@/lib/beacon/types";
import {
  normalizeProfileContent,
  type ProfileContent,
} from "@/lib/beacon/profile-content";
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
import { LandingView } from "./LandingView";
import { ProfileView } from "./ProfileView";
import type { EditResult } from "./ProfileEdit";
import { PullToRefresh } from "./PullToRefresh";
import { notifyFollowers, removeCurrentDevicePushSubscription } from "@/lib/beacon/push";
import { NavIcon } from "./NavIcon";

const AuthView = dynamic(() => import("./AuthView").then((module) => module.AuthView));
const ProfileEdit = dynamic(() => import("./ProfileEdit").then((module) => module.ProfileEdit));
const FollowsView = dynamic(() => import("./FollowsView").then((module) => module.FollowsView));
const ProfilePreview = dynamic(() => import("./ProfilePreview").then((module) => module.ProfilePreview));
const HowtoView = dynamic(() => import("./HowtoView").then((module) => module.HowtoView));
const AppearanceSettings = dynamic(() => import("./AppearanceSettings").then((module) => module.AppearanceSettings));
const RecoverySetup = dynamic(() => import("./RecoverySetup").then((module) => module.RecoverySetup));
const PushNotificationSetting = dynamic(() => import("./PushNotificationSetting").then((module) => module.PushNotificationSetting));

/**
 * Beacon クライアントアプリ本体。beacon.html の SPA を Next.js のクライアント
 * コンポーネントとして再構成したもの。
 *
 * Supabase Authがパスキーを検証し、アプリ内では失効可能なbst_セッションを使う。
 * パスワードは通常の登録・ログイン導線では扱わない。
 */

type NavTab = "profile" | "follows" | "help";
type NavDirection = "none" | "from-left" | "from-right";
type Overlay = "none" | "auth";

const NAV_ORDER: NavTab[] = ["follows", "profile", "help"];
const ADMIN_ENTRY_HANDLES = new Set(["viami_official"]);

function publicChannelsSignature(channels: Channel[]) {
  return JSON.stringify(channels.filter((channel) => channel.status === "live").map((channel) => ({
    type: channel.type,
    url: channel.url,
    label: channel.label,
    descr: channel.descr,
  })));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
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
  const [followsMode, setFollowsMode] = useState<"following" | "followers">("following");
  const [navDirection, setNavDirection] = useState<NavDirection>("none");
  // 全画面オーバーレイ（ナビを隠す）: 認証フォーム / 公開プレビュー
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<"profile" | "links" | "cal" | "photos" | "memo">("profile");
  const [recoveryFocusRequest, setRecoveryFocusRequest] = useState(0);
  const [recoveryHighlighted, setRecoveryHighlighted] = useState(false);
  const recoverySetupRef = useRef<HTMLDivElement | null>(null);
  const recoveryHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [follows, setFollows] = useState<FollowSnapshot[]>([]);
  const [preview, setPreview] = useState<FollowSnapshot | null>(null);
  const [followStates, setFollowStates] = useState<
    Record<string, FollowStatus>
  >({});
  const followCheckInFlight = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const followUpdates = useMemo(
    () =>
      follows.filter((follow) => {
        const state = followStates[follow.handle]?.state;
        return state === "new" || state === "changed" || state === "deleted";
      }).length,
    [follows, followStates],
  );

  function openEditor(target: "profile" | "links" | "cal" | "photos" | "memo" = "profile") {
    setEditTarget(target);
    setEditing(true);
  }

  // 起動時のタブ決定: ?tab= 指定が最優先。無ければ直前に開いていたタブを復元する。
  // 公開ページ(/@handle)へ遷移して戻るとBeaconAppは作り直されnavTabが既定の
  // "profile"（自分のページ）に戻ってしまうため、sessionStorageで元のタブへ戻す。
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "howto" || requested === "settings") {
      setNavTab("help");
      return;
    }
    if (requested && ["profile", "follows", "help"].includes(requested)) {
      setNavTab(requested as NavTab);
      return;
    }
    try {
      const saved = sessionStorage.getItem("via-mi:tab");
      if (saved && ["profile", "follows", "help"].includes(saved)) setNavTab(saved as NavTab);
    } catch {
      /* sessionStorage不可なら既定のまま */
    }
  }, []);

  // 現在のタブを控えておき、公開ページから戻ったときに復元できるようにする。
  useEffect(() => {
    try {
      sessionStorage.setItem("via-mi:tab", navTab);
    } catch {
      /* noop */
    }
  }, [navTab]);

  // Keep the first screen small, then warm the secondary screens while the
  // browser is idle so the first tab/open action does not wait on a new chunk.
  useEffect(() => {
    const preload = () => {
      void Promise.all([
        import("./AuthView"),
        import("./ProfileEdit"),
        import("./FollowsView"),
        import("./ProfilePreview"),
        import("./HowtoView"),
        import("./AppearanceSettings"),
        import("./RecoverySetup"),
        import("./PushNotificationSetting"),
      ]);
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preload, { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(preload, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const [authInitialHandle, setAuthInitialHandle] = useState("");
  const [authInitialPane, setAuthInitialPane] = useState<"create" | "login" | "recover">(
    "create",
  );
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
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

  const pushFollowUpdate = useCallback(() => {
    if (!session) return;
    void notifyFollowers(db, session.handle, session.pass).catch(() => {});
  }, [db, session]);

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

      // 保存セッションがある場合は、検証とプロフィール復元が終わるまで起動画面を保つ。
      // 先にランディングを描画すると、ログイン済みでも未ログイン画面が一瞬見えてしまう。
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
      // Do not reveal the signed-out landing page while a saved session and
      // its profile are still being restored.
      if (!cancelled) setBooting(false);
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
      // カレンダーもログイン時に読み込んでおく（プレビュー/自己フォローの
      // スナップショットが公開メモを正しく含むように）。すべて公開のため
      // get_public_page の cal だけで完結する。
      const cal: CalMap = {};
      const [page, clicks, security] = await Promise.all([
        getPublicPage(db, handle),
        getClicks(db, handle, pass).catch(() => ({})),
        getAccountSecurity(db, handle, pass).catch(() => ({
          passkey_linked: false,
          recovery_verified: false,
          recovery_kind: null,
          recovery_email_masked: null,
        })),
      ]);
      (page?.cal ?? []).forEach((e) => (cal[e.d] = { memo: e.memo }));
      return {
        profile: page?.profile ?? emptyProfile(handle),
        followerCount: page?.follower_count ?? 0,
        channels: ensureIds(page?.channels ?? []),
        cal,
        clicks,
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
    async (handle: string, pass: string): Promise<FollowSnapshot[]> => {
      const local = loadFollows(handle);
      try {
        const targets = await getMyFollows(db, handle, pass);
        const cached = new Map(local.map((item) => [item.handle, item]));
        const resolved = await mapWithConcurrency(
          targets,
          4,
          async (target) => {
            const existing = cached.get(target);
            if (existing) return existing;
            try {
              const page = await getPublicPageCore(db, target);
              return page
                ? toSnapshot(page.profile, page.channels, page.cal)
                : null;
            } catch {
              return cached.get(target) ?? null;
            }
          },
        );
        const accountFollows = resolved.filter(
          (item): item is FollowSnapshot => item !== null,
        );
        replaceFollows(handle, accountFollows);
        setFollows(accountFollows);
        return accountFollows;
      } catch {
        /* サーバー同期に失敗しても端末のローカル一覧はそのまま使える */
        return local;
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
        // メール内リンクはブラウザで開くとホーム画面版(PWA)と別コンテキストになり
        // 認証が引き継がれない。基本は本文の6桁コードを verifyOtp で使う。
        // リンクも残しておき、同一ブラウザで開いた場合のフォールバックにする。
        emailRedirectTo: "https://via-mi.com/?recover=1",
      },
    });
    if (result.error) throw result.error;
    setRecoveryEmail(destination);
    toast("確認コードを送信しました");
  }, [db, toast]);

  // セッション確立後の共通処理: パスキー登録 → アプリセッション発行 → ログイン。
  const finalizeRecovery = useCallback(async () => {
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

  // 6桁コードをこのコンテキストで検証してセッションを確立（PWAでも完結する）。
  const verifyRecoveryCode = useCallback(async (code: string) => {
    const verified = await db.auth.verifyOtp({
      email: recoveryEmail,
      token: code.trim(),
      type: "email",
    });
    if (verified.error) throw verified.error;
    await finalizeRecovery();
  }, [db, recoveryEmail, finalizeRecovery]);

  // メール内リンクを同一ブラウザで開いた場合のフォールバック。
  const completeRecovery = useCallback(async () => {
    const sessionResult = await db.auth.getSession();
    if (!sessionResult.data.session) throw new Error("auth");
    await finalizeRecovery();
  }, [db, finalizeRecovery]);

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
      void removeCurrentDevicePushSubscription(db, session.handle, session.pass)
        .finally(() => deleteSession(db, session.handle, session.pass))
        .catch(() => {});
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
      else if (publicChannelsSignature(prev) !== publicChannelsSignature(next)) pushFollowUpdate();
      return ok;
    },
    [db, session, me, runWrite, pushFollowUpdate],
  );

  const persistCal = useCallback(
    async (date: string, memo: string): Promise<boolean> => {
      if (!session) return false;
      const previous = me?.cal[date];
      setMe((current) => {
        if (!current) return current;
        const cal = { ...current.cal };
        if (memo) cal[date] = { memo };
        else delete cal[date];
        return { ...current, cal };
      });
      const ok = await runWrite(() =>
        rpcSaveCal(db, session.handle, session.pass, date, memo),
      );
      if (ok) {
        pushFollowUpdate();
      } else {
        setMe((current) => {
          if (!current) return current;
          const cal = { ...current.cal };
          if (previous) cal[date] = previous;
          else delete cal[date];
          return { ...current, cal };
        });
      }
      return ok;
    },
    [db, session, me, runWrite, pushFollowUpdate],
  );

  const persistProfileContent = useCallback(
    async (patch: Partial<ProfileContent>): Promise<boolean> => {
      if (!session || !me) return false;
      // 部分更新（写真だけ / メモだけ）でも他方を保持するため現状にマージする。
      const previous = normalizeProfileContent(me.profile.content);
      const normalized = normalizeProfileContent({ ...previous, ...patch });
      setMe((current) => current ? {
        ...current,
        profile: { ...current.profile, content: normalized },
      } : current);
      const ok = await runWrite(() =>
        updateProfileContent(db, session.handle, session.pass, normalized),
      );
      if (!ok) {
        setMe((current) => current ? {
          ...current,
          profile: { ...current.profile, content: previous },
        } : current);
      } else {
        pushFollowUpdate();
      }
      return ok;
    },
    [db, session, me, runWrite, pushFollowUpdate],
  );

  const uploadProfilePhoto = useCallback(
    async (file: File): Promise<string | null> => {
      if (!session) return null;
      try {
        return await uploadImage(db, session.handle, session.pass, "photo", file);
      } catch (error) {
        toast(writeErrorMessage(error));
        return null;
      }
    },
    [db, session, toast],
  );

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
          color_theme: edit.colorTheme,
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
        pushFollowUpdate();
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
    [db, session, me, toast, logout, pushFollowUpdate],
  );

  const doDeleteAccount = useCallback(async () => {
    if (!session) return;
    if (
      !window.confirm(
        "本当に退会しますか？\nプロフィール・リンク・カレンダー・画像はすべて削除され、元に戻せません。",
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
  const checkFollowsNow = useCallback(
    async (list: FollowSnapshot[]) => {
      if (!list.length) return;
      setFollowStates((prev) => {
        const next = { ...prev };
        for (const f of list)
          if (!next[f.handle]) next[f.handle] = { state: "loading", addedLive: 0 };
        return next;
      });
      // まず全フォロー相手の更新時刻を1回でまとめて取得し、前回スナップショットと
      // 一致する（＝変化なし）相手は本体取得を省く。フォロー数が多いほどDB読み取りを削減。
      const updatedMap = await getPagesUpdated(db, list.map((f) => f.handle)).catch(
        () => ({}) as Record<string, string>,
      );
      const entries = await mapWithConcurrency(
        list,
        4,
        async (snap) => {
          try {
            const fresh = updatedMap[snap.handle];
            const known = snap.pageUpdated;
            // 更新時刻が判明していて前回と一致するなら、本体取得せず「変化なし」。
            if (fresh && known && Date.parse(fresh) === Date.parse(known)) {
              return [snap.handle, { state: "same", addedLive: 0 } as FollowStatus] as const;
            }
            const page = await getPublicPageCore(db, snap.handle);
            return [snap.handle, diffFollow(snap, page)] as const;
          } catch {
            return [
              snap.handle,
              { state: "same", addedLive: 0 } as FollowStatus,
            ] as const;
          }
        },
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

  // Visibility, tab open and pull-to-refresh can happen almost together on
  // mobile. Share the same request instead of sending identical RPC batches.
  const checkFollows = useCallback((list: FollowSnapshot[]): Promise<void> => {
    if (!list.length) return Promise.resolve();
    const key = `${session?.handle ?? "guest"}:${list
      .map((follow) => `${follow.handle}:${follow.pageUpdated ?? ""}`)
      .sort()
      .join("|")}`;
    if (followCheckInFlight.current?.key === key) {
      return followCheckInFlight.current.promise;
    }
    const promise = checkFollowsNow(list).finally(() => {
      if (followCheckInFlight.current?.promise === promise) {
        followCheckInFlight.current = null;
      }
    });
    followCheckInFlight.current = { key, promise };
    return promise;
  }, [checkFollowsNow, session]);

  // フォロー一覧の正本は端末のlocalStorage。公開ページ(/@handle)でフォローすると
  // そちらのFollowButtonがlocalStorageを更新するが、アプリ側のReact状態は起動時の
  // ままになる。アプリに戻った・再表示したタイミングでlocalStorageから読み直す。
  const reloadFollowsFromStore = useCallback(() => {
    setFollows(loadFollows(session?.handle ?? null));
  }, [session]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadFollowsFromStore();
    };
    document.addEventListener("visibilitychange", onVisible);
    // bfcache から復元されたとき（visibilitychange が発火しない端末向け）
    window.addEventListener("pageshow", reloadFollowsFromStore);
    window.addEventListener("focus", reloadFollowsFromStore);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", reloadFollowsFromStore);
      window.removeEventListener("focus", reloadFollowsFromStore);
    };
  }, [reloadFollowsFromStore]);

  const refreshLatest = useCallback(async () => {
    // 下引っ張り更新でも、まずlocalStorageの最新一覧を取り込む（公開ページで
    // フォローした分を反映）。その上で本人プロフィールと各相手の変化を取り直す。
    const current = loadFollows(session?.handle ?? null);
    setFollows(current);
    try {
      const syncedFollows = session
        ? syncFollowsFromServer(session.handle, session.pass)
        : Promise.resolve(current);
      await Promise.all([
        session
          ? loadMe(session.handle, session.pass).then((latest) => setMe(latest))
          : Promise.resolve(),
        syncedFollows.then((latest) => checkFollows(latest)),
      ]);
    } catch {
      toast("更新できませんでした");
    }
  }, [session, loadMe, checkFollows, syncFollowsFromServer, toast]);

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

  // ---- アプリ内プレビュー（フォロー相手/検索結果を遷移せず開く）----
  const openPreview = useCallback((snap: FollowSnapshot) => {
    setPreview(snap);
  }, []);

  // 自分をフォローしている相手の一覧（本人のみ・要パスコード）。フォロータブの
  // 「フォロワー」表示で必要になったタイミングで取得する。
  const loadFollowers = useCallback(async (): Promise<FollowerRow[]> => {
    if (!session) return [];
    return getMyFollowers(db, session.handle, session.pass);
  }, [db, session]);

  const onPreviewToggleFollow = useCallback(
    (snap: FollowSnapshot) => {
      if (follows.some((f) => f.handle === snap.handle)) {
        onUnfollow(snap.handle);
      } else {
        onUpdateSnapshot(snap);
        toast("フォローしました");
      }
    },
    [follows, onUnfollow, onUpdateSnapshot, toast],
  );

  // プレビューで最新を取得したら、フォロー中ならスナップショットを更新（更新バッジも消える）。
  const onPreviewRefreshed = useCallback(
    (handle: string, snap: FollowSnapshot | null) => {
      setFollows((cur) => {
        if (!cur.some((f) => f.handle === handle)) return cur; // 未フォローなら一覧は変えない
        if (!snap) {
          setFollowStates((s) => ({ ...s, [handle]: { state: "deleted", addedLive: 0 } }));
          return cur;
        }
        const next = cur.map((f) => (f.handle === handle ? snap : f));
        replaceFollows(session?.handle ?? null, next);
        setFollowStates((s) => ({ ...s, [handle]: { state: "same", addedLive: 0 } }));
        return next;
      });
    },
    [session],
  );

  function goNav(v: NavTab) {
    setPreview(null);
    if (v !== navTab) {
      setNavDirection(NAV_ORDER.indexOf(v) > NAV_ORDER.indexOf(navTab) ? "from-right" : "from-left");
      window.scrollTo({ top: 0, behavior: "auto" });
    }
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
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  if (booting) {
    return (
      <main className="appBoot" aria-label="via-miを読み込み中" aria-busy="true">
        <div className="appBootContent">
          <span className="logo appBootLogo" aria-hidden="true">via-mi</span>
          <span className="appBootSpinner" aria-hidden="true" />
        </div>
      </main>
    );
  }

  const showNav = true;

  return (
    <>
      <PullToRefresh enabled={overlay === "none" && !editing && !preview} onRefresh={refreshLatest}>
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
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
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
              {saveStatus === "error" && "保存失敗"}
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
            <span className="recoveryBannerText">復旧用のメールアドレスを設定</span>
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
            onRecoveryVerify={verifyRecoveryCode}
            onRecoveryComplete={completeRecovery}
            recoverySessionReady={recoverySessionReady}
            onBack={() => setOverlay("none")}
            toast={toast}
          />
        )}

        {/* 通常モード: プロフィール / フォロー中 / 使い方 */}
        {overlay === "none" && (
          <div key={navTab} className={`tabStage ${navDirection}`}>
        {navTab === "profile" && (
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
                  onSaveContent={persistProfileContent}
                  onUploadPhoto={uploadProfilePhoto}
                  onOpenFollowers={() => {
                    setFollowsMode("followers");
                    goNav("follows");
                  }}
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
                  onSaveContent={persistProfileContent}
                  onUploadPhoto={uploadProfilePhoto}
                  onOpenFollowers={() => {
                    setFollowsMode("followers");
                    goNav("follows");
                  }}
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

        {navTab === "follows" && (
          <FollowsView
            follows={follows}
            states={followStates}
            onUnfollow={onUnfollow}
            onOpenProfile={openPreview}
            onLoadFollowers={loadFollowers}
            mode={followsMode}
            onModeChange={setFollowsMode}
            loggedIn={!!session}
            onLoginPrompt={() => openAuth("login")}
          />
        )}

        {navTab === "help" && <HowtoView />}

        {navTab === "help" && (
          <section className="view settingsView">
            <AppearanceSettings />
            <div className="card">
              <h2 style={{ margin: "0 0 8px" }}>アカウント</h2>
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
                  <PushNotificationSetting
                    handle={session.handle}
                    secret={session.pass}
                    toast={toast}
                  />
                  {ADMIN_ENTRY_HANDLES.has(session.handle) && (
                    <Link
                      className="btn ghost"
                      href="/admin"
                      style={{ marginTop: 0, textDecoration: "none" }}
                    >
                      管理画面
                    </Link>
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
        )}
        </div>
      </PullToRefresh>

      {showNav && (
        <nav className="nav" aria-label="メインナビゲーション">
          <button
            className={`ni ${navTab === "profile" ? "on" : ""}`}
            onClick={() => goNav("profile")}
            aria-label="プロフィール"
            aria-current={navTab === "profile" ? "page" : undefined}
            style={{ order: 2 }}
          >
            <NavIcon name="profile" />
          </button>
          <button
            className={`ni ${navTab === "follows" ? "on" : ""}`}
            onClick={() => goNav("follows")}
            aria-label="フォロー中"
            aria-current={navTab === "follows" ? "page" : undefined}
            style={{ position: "relative", order: 1 }}
          >
            <NavIcon name="follows" />
            {followUpdates > 0 && (
              <span className="navLamp" role="img" aria-label={`${followUpdates}件の更新`} />
            )}
          </button>
          <button
            className={`ni ${navTab === "help" ? "on" : ""}`}
            onClick={() => goNav("help")}
            aria-label="ヘルプ"
            aria-current={navTab === "help" ? "page" : undefined}
            style={{ order: 3 }}
          >
            <NavIcon name="help" />
          </button>
        </nav>
      )}

      {preview && (
        <ProfilePreview
          key={preview.handle}
          initial={preview}
          following={follows.some((f) => f.handle === preview.handle)}
          onClose={() => setPreview(null)}
          onToggleFollow={onPreviewToggleFollow}
          onRefreshed={onPreviewRefreshed}
        />
      )}

      <div className={`toast ${toastOn ? "show" : ""}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  );
}
