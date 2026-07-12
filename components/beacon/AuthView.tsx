"use client";

import { useState } from "react";
import { cleanHandle } from "@/lib/beacon/format";
import { authErrorMessage, type ToastFn } from "./appTypes";

/**
 * 認証画面。beacon.html の v-auth を移植。
 * 4ペイン: 作成 / 復旧コード表示 / ログイン / パスコード再設定。
 *
 * デモとの違い（本番化）:
 *   - ハッシュ照合をブラウザでやらず、createAccount/verifyLogin/resetPass で
 *     サーバー検証する（呼び出しは onCreate/onLogin/onReset 経由）。
 *   - ID の空き確認はサーバーの accounts を読めないため、作成時の 'taken'
 *     エラーで判定する（形式チェックのみ即時）。
 */

type Pane = "create" | "recovery" | "login" | "recover";

export function AuthView({
  initialHandle,
  initialPane,
  onCreate,
  onLogin,
  onReset,
  onEnter,
  onBack,
  knownHandles = [],
  toast,
}: {
  initialHandle: string;
  initialPane: "create" | "login";
  /** 成功時は復旧コード（平文）を返す。remember でログイン状態を保持する。 */
  onCreate: (handle: string, pass: string, remember: boolean) => Promise<string>;
  onLogin: (
    handle: string,
    pass: string,
    opts: { remember: boolean },
  ) => Promise<void>;
  onReset: (handle: string, code: string, newPass: string) => Promise<void>;
  /** 復旧コードを控えたあとアプリへ入る。 */
  onEnter: () => void;
  /** ランディングへ戻る（作成/ログイン画面のみ表示）。 */
  onBack?: () => void;
  /** この端末で使ったID（複数プロフィールの切替チップ）。 */
  knownHandles?: string[];
  toast: ToastFn;
}) {
  const [pane, setPane] = useState<Pane>(initialPane);

  // ---- 作成 ----
  const [cId, setCId] = useState(initialHandle);
  const [cPass, setCPass] = useState("");
  const [cBusy, setCBusy] = useState(false);
  const cClean = cleanHandle(cId);
  const idHint =
    !cClean
      ? { t: "", cls: "" }
      : cClean.length < 3
        ? { t: "3文字以上にしてください", cls: "no" }
        : { t: "@" + cClean + " で作成します", cls: "ok" };
  const passHint =
    !cPass
      ? { t: "", cls: "" }
      : cPass.length < 10
        ? { t: "10文字以上にしてください", cls: "no" }
        : new TextEncoder().encode(cPass).length > 72
          ? { t: "72バイト以内にしてください", cls: "no" }
        : { t: "OK", cls: "ok" };
  const canCreate =
    cClean.length >= 3 &&
    cPass.length >= 10 &&
    new TextEncoder().encode(cPass).length <= 72 &&
    !cBusy;
  // ログイン状態の保持（サーバー発行のセッショントークンを端末に保存）。
  // X/Instagram等と同じ体験を既定にするためデフォルトON。共有PC向けにオフにできる。
  const [cTrust, setCTrust] = useState(true);

  const [rc, setRc] = useState("");
  const [rcCopied, setRcCopied] = useState(false);

  async function submitCreate() {
    if (!canCreate) return;
    setCBusy(true);
    try {
      const code = await onCreate(cClean, cPass, cTrust);
      setRc(code);
      setCPass("");
      setPane("recovery");
    } catch (e) {
      toast(authErrorMessage(e));
    } finally {
      setCBusy(false);
    }
  }

  // ---- ログイン ----
  const [lId, setLId] = useState(initialHandle);
  const [lPass, setLPass] = useState("");
  const [lHint, setLHint] = useState("");
  const [lBusy, setLBusy] = useState(false);
  const [lTrust, setLTrust] = useState(true);
  async function submitLogin() {
    const h = cleanHandle(lId);
    if (!h || !lPass) {
      setLHint("IDとパスコードを入力してください");
      return;
    }
    setLBusy(true);
    setLHint("");
    try {
      await onLogin(h, lPass, { remember: lTrust });
      setLPass("");
    } catch (e) {
      setLHint(authErrorMessage(e));
    } finally {
      setLBusy(false);
    }
  }

  // ---- 再設定 ----
  const [rId, setRId] = useState("");
  const [rCode, setRCode] = useState("");
  const [rNew, setRNew] = useState("");
  const [rHint, setRHint] = useState("");
  const [rBusy, setRBusy] = useState(false);
  async function submitReset() {
    const h = cleanHandle(rId);
    if (!h || !rCode.trim()) {
      setRHint("IDと復旧コードを入力してください");
      return;
    }
    if (rNew.length < 10) {
      setRHint("新しいパスコードは10文字以上にしてください");
      return;
    }
    if (new TextEncoder().encode(rNew).length > 72) {
      setRHint("新しいパスコードは72バイト以内にしてください");
      return;
    }
    setRBusy(true);
    setRHint("");
    try {
      await onReset(h, rCode, rNew);
      setRNew("");
      setRCode("");
      toast("再設定しました。ログインしてください");
      setLId(h);
      setPane("login");
    } catch (e) {
      setRHint(authErrorMessage(e));
    } finally {
      setRBusy(false);
    }
  }

  return (
    <section className="view">
      {pane === "create" && (
        <div>
          {onBack && (
            <a className="backlink" onClick={onBack}>
              ← 戻る
            </a>
          )}
          <h1>IDを作成</h1>
          <div className="lead">
            メールアドレスは不要です。IDとパスコードだけで作れます。
          </div>
          <div className="card">
            <label className="f">ID</label>
            <div className="idfield">
              <span className="at">@</span>
              <input
                value={cId}
                onChange={(e) => setCId(cleanHandle(e.target.value))}
                placeholder="my_ideal"
                maxLength={20}
                autoComplete="off"
              />
            </div>
            <div className={`hint ${idHint.cls}`}>{idHint.t}</div>
            <label className="f">パスコード（10文字以上）</label>
            <input
              value={cPass}
              onChange={(e) => setCPass(e.target.value)}
              type="password"
              placeholder="••••••"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && submitCreate()}
            />
            <div className={`hint ${passHint.cls}`}>{passHint.t}</div>
            <label className="chk">
              <input
                type="checkbox"
                checked={cTrust}
                onChange={(e) => setCTrust(e.target.checked)}
              />
              <span>
                ログイン状態を保持する（共有PCではオフにしてください）
              </span>
            </label>
            <button
              className="btn sig"
              disabled={!canCreate}
              onClick={submitCreate}
            >
              {cBusy ? "作成中…" : "作成する"}
            </button>
          </div>
          <div className="authswitch">
            すでにIDがある → <a onClick={() => setPane("login")}>ログイン</a>
          </div>
        </div>
      )}

      {pane === "recovery" && (
        <div>
          <h1>アカウントを作成しました</h1>
          <div className="lead">
            この「復旧コード」を控えておくと、パスコードを忘れても復旧できます。
            あとでプロフィール画面からいつでも確認・再発行できるので、今すぐでなくても大丈夫です。
          </div>
          <div className="card">
            <div className="rcode">{rc}</div>
            <button
              className="btn ghost"
              onClick={() => {
                navigator.clipboard?.writeText(rc);
                setRcCopied(true);
                toast("コピーしました");
              }}
            >
              {rcCopied ? "コピーしました ✓" : "コピー"}
            </button>
            <button
              className="btn sig"
              style={{ marginTop: 14 }}
              onClick={onEnter}
            >
              控えた・はじめる
            </button>
            <button className="btn ghost" onClick={onEnter}>
              あとで設定する
            </button>
          </div>
          <div className="note">
            ※ メールアドレスを登録しないため、パスコードと復旧コードの両方を
            忘れるとログインできなくなります。復旧コードはプロフィールの
            「復旧コードを再発行」からいつでも作り直せます。
          </div>
        </div>
      )}

      {pane === "login" && (
        <div>
          {onBack && (
            <a className="backlink" onClick={onBack}>
              ← 戻る
            </a>
          )}
          <h1>ログイン</h1>
          <div className="lead">別の端末で作ったIDにも、これで入れます。</div>
          <div className="card">
            {knownHandles.length > 0 && (
              <>
                <label className="f">この端末で使ったID</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  {knownHandles.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={h === cleanHandle(lId) ? "pill solid" : "pill line"}
                      style={{ padding: "6px 14px", fontSize: 12 }}
                      onClick={() => setLId(h)}
                    >
                      @{h}
                    </button>
                  ))}
                </div>
              </>
            )}
            <label className="f">ID</label>
            <div className="idfield">
              <span className="at">@</span>
              <input
                value={lId}
                onChange={(e) => setLId(cleanHandle(e.target.value))}
                placeholder="my_ideal"
                maxLength={20}
                autoComplete="off"
              />
            </div>
            <label className="f">パスコード</label>
            <input
              value={lPass}
              onChange={(e) => setLPass(e.target.value)}
              type="password"
              placeholder="••••••"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && submitLogin()}
            />
            <div className="hint no">{lHint}</div>
            <label className="chk">
              <input
                type="checkbox"
                checked={lTrust}
                onChange={(e) => setLTrust(e.target.checked)}
              />
              <span>
                ログイン状態を保持する（共有PCではオフにしてください）
              </span>
            </label>
            <button className="btn sig" disabled={lBusy} onClick={submitLogin}>
              {lBusy ? "確認中…" : "ログイン"}
            </button>
          </div>
          <div className="authswitch">
            IDを作る → <a onClick={() => setPane("create")}>新規作成</a>　/
            <a onClick={() => setPane("recover")}>パスコードを忘れた</a>
          </div>
        </div>
      )}

      {pane === "recover" && (
        <div>
          <h1>パスコードの再設定</h1>
          <div className="lead">
            作成時に控えた復旧コードで再設定できます。
          </div>
          <div className="card">
            <label className="f">ID</label>
            <div className="idfield">
              <span className="at">@</span>
              <input
                value={rId}
                onChange={(e) => setRId(cleanHandle(e.target.value))}
                placeholder="my_ideal"
                maxLength={20}
                autoComplete="off"
              />
            </div>
            <label className="f">復旧コード</label>
            <input
              value={rCode}
              onChange={(e) => setRCode(e.target.value)}
              placeholder="作成時に表示された12桁コード"
              autoComplete="off"
            />
            <label className="f">新しいパスコード（10文字以上）</label>
            <input
              value={rNew}
              onChange={(e) => setRNew(e.target.value)}
              type="password"
              placeholder="••••••"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && submitReset()}
            />
            <div className="hint no">{rHint}</div>
            <button className="btn sig" disabled={rBusy} onClick={submitReset}>
              {rBusy ? "再設定中…" : "再設定する"}
            </button>
          </div>
          <div className="authswitch">
            <a onClick={() => setPane("login")}>ログインに戻る</a>
          </div>
        </div>
      )}
    </section>
  );
}
