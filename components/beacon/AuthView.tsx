"use client";

import { useState } from "react";
import { cleanHandle } from "@/lib/beacon/format";
import { authErrorMessage, type ToastFn } from "./appTypes";

type Pane = "create" | "login" | "recover";

export function AuthView({
  initialHandle,
  initialPane,
  onCreate,
  onLogin,
  onRecoverySend,
  onRecoveryComplete,
  recoverySessionReady = false,
  onBack,
  toast,
}: {
  initialHandle: string;
  initialPane: "create" | "login" | "recover";
  onCreate: (handle: string) => Promise<void>;
  onLogin: () => Promise<void>;
  onRecoverySend: (destination: string) => Promise<void>;
  onRecoveryComplete: () => Promise<void>;
  recoverySessionReady?: boolean;
  onBack?: () => void;
  toast: ToastFn;
}) {
  const [pane, setPane] = useState<Pane>(initialPane);
  const [handleInput, setHandleInput] = useState(initialHandle);
  const [recoveryDestination, setRecoveryDestination] = useState("");
  const [recoveryPending, setRecoveryPending] = useState(false);
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
          <div className="authAction">
            <p className="lead">端末に保存したパスキーでログインします。</p>
            {hint && <div className="hint no">{hint}</div>}
            <button className="btn sig" disabled={busy || !supported} onClick={() => run(onLogin)}>
              {busy ? "確認中…" : "パスキーでログイン"}
            </button>
            {!supported && <div className="hint no">この端末はパスキーに対応していません。</div>}
          </div>
        </div>
        <div className="authswitch">
          IDを作る → <button type="button" className="textlink" onClick={() => setPane("create")}>新規作成</button>
        </div>
        <div className="authswitch recoveryLink">
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
          <p className="lead">認証済みのメールアドレスで確認し、この端末に新しいパスキーを登録します。</p>
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
          {!recoveryPending ? (
            <>
              <label className="f" htmlFor="recover-destination">メールアドレス</label>
              <input
                id="recover-destination"
                type="email"
                value={recoveryDestination}
                onChange={(event) => setRecoveryDestination(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <button
                className="btn sig"
                disabled={busy || !recoveryDestination.trim()}
                onClick={() => run(async () => {
                  await onRecoverySend(recoveryDestination.trim());
                  setRecoveryPending(true);
                })}
              >
                {busy ? "送信中…" : "確認メールを送る"}
              </button>
            </>
          ) : (
            <>
              <div className="lead">メール内の確認リンクを開いてください。確認後、この画面に戻ります。</div>
              <button className="textlink" type="button" onClick={() => { setRecoveryPending(false); }}>メールアドレスを入力し直す</button>
            </>
          )}
          <div className="hint no">{hint}</div>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="view authSimple">
      {back}
      <h1>はじめる</h1>
      <p className="lead authLead">
        IDはあなたのページのアドレスになります。<br />
        あとから変更することはできません。
      </p>
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
          {handle.length >= 3
            ? `アドレス → via-mi.com/@${handle}`
            : handle.length > 0
              ? "3文字以上にしてください"
              : "英数字と _（アンダースコア）が使えます"}
        </div>
        <div className="authAction">
          <p className="lead">この端末にパスキーを保存します。<br />パスワードなしでログインできます。</p>
          {hint && <div className="hint no">{hint}</div>}
          <button
            className="btn sig"
            disabled={busy || handle.length < 3 || !supported}
            onClick={() => run(() => onCreate(handle))}
          >
            {busy ? "作成中…" : "パスキーで作成"}
          </button>
          {!supported && <div className="hint no">この端末はパスキーに対応していません。</div>}
        </div>
      </div>
      <div className="authswitch">
        すでにIDがある → <button type="button" className="textlink" onClick={() => setPane("login")}>ログイン</button>
      </div>
    </section>
  );
}
