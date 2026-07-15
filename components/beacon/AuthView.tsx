"use client";

import { useState } from "react";
import { cleanHandle } from "@/lib/beacon/format";
import { authErrorMessage, type ToastFn } from "./appTypes";

type Pane = "create" | "login" | "legacy" | "recover";
type RecoveryMethod = "email" | "phone";

export function AuthView({
  initialHandle,
  initialPane,
  onCreate,
  onLogin,
  onLegacyMigrate,
  onRecoverySend,
  onRecoveryVerify,
  onRecoveryComplete,
  recoverySessionReady = false,
  onBack,
  toast,
}: {
  initialHandle: string;
  initialPane: "create" | "login" | "recover";
  onCreate: (handle: string) => Promise<void>;
  onLogin: () => Promise<void>;
  onLegacyMigrate: (handle: string, passcode: string) => Promise<void>;
  onRecoverySend: (method: RecoveryMethod, destination: string) => Promise<void>;
  onRecoveryVerify: (method: RecoveryMethod, destination: string, code: string) => Promise<void>;
  onRecoveryComplete: () => Promise<void>;
  recoverySessionReady?: boolean;
  onBack?: () => void;
  toast: ToastFn;
}) {
  const [pane, setPane] = useState<Pane>(initialPane);
  const [handleInput, setHandleInput] = useState(initialHandle);
  const [legacyPasscode, setLegacyPasscode] = useState("");
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>("email");
  const [recoveryDestination, setRecoveryDestination] = useState("");
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const handle = cleanHandle(handleInput);
  const supported = typeof window === "undefined" || "PublicKeyCredential" in window;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setHint("");
    try {
      await action();
    } catch (error) {
      const message = authErrorMessage(error);
      setHint(message);
      toast(message);
    } finally {
      setBusy(false);
    }
  }

  const back = onBack && (
    <button type="button" className="backlink" onClick={onBack}>← 戻る</button>
  );

  if (pane === "login") {
    return (
      <section className="view authSimple">
        {back}
        <h1>ログイン</h1>
        <div className="card">
          <div className="passkeyMark" aria-hidden="true">🔑</div>
          <p className="lead">Face ID・指紋認証・端末のロック解除でログインします。</p>
          <div className="hint no">{hint}</div>
          <button className="btn sig" disabled={busy || !supported} onClick={() => run(onLogin)}>
            {busy ? "確認中…" : "パスキーでログイン"}
          </button>
          {!supported && <div className="hint no">この端末はパスキーに対応していません。</div>}
        </div>
        <div className="authswitch">
          IDを作る → <button type="button" className="textlink" onClick={() => setPane("create")}>新規作成</button>
        </div>
        <div className="authswitch legacyLink">
          <button type="button" className="textlink" onClick={() => setPane("legacy")}>以前のIDをパスキーへ移行</button>
        </div>
        <div className="authswitch legacyLink">
          <button type="button" className="textlink" onClick={() => setPane("recover")}>パスキーを使えない場合</button>
        </div>
      </section>
    );
  }

  if (pane === "recover") {
    return (
      <section className="view authSimple">
        <button type="button" className="backlink" onClick={() => setPane("login")}>← ログインに戻る</button>
        <h1>アカウントを復旧</h1>
        <div className="card">
          <p className="lead">認証済みの連絡先で確認し、この端末に新しいパスキーを登録します。</p>
          {recoverySessionReady ? (
            <>
              <div className="hint ok">メールアドレスを確認できました。</div>
              <button className="btn sig" disabled={busy || !supported} onClick={() => run(onRecoveryComplete)}>
                {busy ? "登録中…" : "新しいパスキーを登録"}
              </button>
              <div className="hint no">{hint}</div>
            </>
          ) : (
            <>
          <div className="methodTabs" role="tablist" aria-label="復旧方法">
            <button type="button" className={recoveryMethod === "email" ? "on" : ""} onClick={() => { setRecoveryMethod("email"); setRecoveryPending(false); }}>メール</button>
            <button type="button" className={recoveryMethod === "phone" ? "on" : ""} onClick={() => { setRecoveryMethod("phone"); setRecoveryPending(false); }}>電話番号</button>
          </div>
          {!recoveryPending ? (
            <>
              <label className="f" htmlFor="recover-destination">{recoveryMethod === "email" ? "メールアドレス" : "電話番号（国番号付き）"}</label>
              <input
                id="recover-destination"
                type={recoveryMethod === "email" ? "email" : "tel"}
                value={recoveryDestination}
                onChange={(event) => setRecoveryDestination(event.target.value)}
                placeholder={recoveryMethod === "email" ? "you@example.com" : "+819012345678"}
                autoComplete={recoveryMethod === "email" ? "email" : "tel"}
              />
              <button
                className="btn sig"
                disabled={busy || !recoveryDestination.trim()}
                onClick={() => run(async () => {
                  await onRecoverySend(recoveryMethod, recoveryDestination.trim());
                  setRecoveryPending(true);
                })}
              >
                {busy ? "送信中…" : recoveryMethod === "email" ? "確認メールを送る" : "確認コードを送る"}
              </button>
            </>
          ) : recoveryMethod === "email" ? (
            <>
              <div className="lead">メール内の確認リンクを開いてください。確認後、この画面に戻ります。</div>
              <button className="textlink" type="button" onClick={() => { setRecoveryPending(false); }}>メールアドレスを入力し直す</button>
            </>
          ) : (
            <>
              <div className="lead">届いた確認コードを入力してください。</div>
              <label className="f" htmlFor="recover-code">確認コード</label>
              <input
                id="recover-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="確認コード"
              />
              <button
                className="btn sig"
                disabled={busy || recoveryCode.length < 6 || !supported}
                onClick={() => run(() => onRecoveryVerify(recoveryMethod, recoveryDestination.trim(), recoveryCode))}
              >
                {busy ? "登録中…" : "新しいパスキーを登録"}
              </button>
              <button className="textlink" type="button" onClick={() => { setRecoveryPending(false); setRecoveryCode(""); }}>入力し直す</button>
            </>
          )}
          <div className="hint no">{hint}</div>
            </>
          )}
        </div>
      </section>
    );
  }

  if (pane === "legacy") {
    return (
      <section className="view authSimple">
        <button type="button" className="backlink" onClick={() => setPane("login")}>← ログインに戻る</button>
        <h1>以前のIDを移行</h1>
        <div className="card">
          <label className="f" htmlFor="legacy-id">ID</label>
          <div className="idfield">
            <span className="at">@</span>
            <input
              id="legacy-id"
              value={handleInput}
              onChange={(event) => setHandleInput(event.target.value)}
              onCompositionEnd={(event) => setHandleInput(cleanHandle(event.currentTarget.value))}
              onBlur={(event) => setHandleInput(cleanHandle(event.currentTarget.value))}
              maxLength={20}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              lang="en"
            />
          </div>
          <label className="f" htmlFor="legacy-pass">現在のパスコード</label>
          <input
            id="legacy-pass"
            type="password"
            value={legacyPasscode}
            onChange={(event) => setLegacyPasscode(event.target.value)}
            autoComplete="current-password"
          />
          <div className="hint no">{hint}</div>
          <button
            className="btn sig"
            disabled={busy || handle.length < 3 || !legacyPasscode || !supported}
            onClick={() => run(() => onLegacyMigrate(handle, legacyPasscode))}
          >
            {busy ? "移行中…" : "パスキーへ移行"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="view authSimple">
      {back}
      <h1>IDを作成</h1>
      <div className="card">
        <label className="f" htmlFor="create-id">ID</label>
        <div className="idfield">
          <span className="at">@</span>
          <input
            id="create-id"
            value={handleInput}
            onChange={(event) => setHandleInput(event.target.value)}
            onCompositionEnd={(event) => setHandleInput(cleanHandle(event.currentTarget.value))}
            onBlur={(event) => setHandleInput(cleanHandle(event.currentTarget.value))}
            placeholder="via_mi_id"
            maxLength={20}
            autoComplete="username webauthn"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            lang="en"
          />
        </div>
        <div className={`hint ${handle.length >= 3 ? "ok" : ""}`}>
          {handle ? (handle.length >= 3 ? `@${handle} で作成します` : "3文字以上にしてください") : ""}
        </div>
        <p className="lead passkeyLead">パスワードは不要です。端末のFace IDなどを使います。</p>
        <div className="hint no">{hint}</div>
        <button
          className="btn sig"
          disabled={busy || handle.length < 3 || !supported}
          onClick={() => run(() => onCreate(handle))}
        >
          {busy ? "作成中…" : "パスキーで作成"}
        </button>
        {!supported && <div className="hint no">この端末はパスキーに対応していません。</div>}
      </div>
      <div className="authswitch">
        すでにIDがある → <button type="button" className="textlink" onClick={() => setPane("login")}>ログイン</button>
      </div>
    </section>
  );
}
