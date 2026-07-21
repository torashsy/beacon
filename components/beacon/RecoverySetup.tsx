"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncRecoveryStatus, type RecoveryStatus } from "@/lib/beacon/rpc";
import type { ToastFn } from "./appTypes";

export function RecoverySetup({
  verified,
  emailMasked,
  onReauthenticate,
  onVerified,
  toast,
}: {
  verified: boolean;
  emailMasked: string | null;
  onReauthenticate: () => Promise<void>;
  onVerified: (status: RecoveryStatus) => void;
  toast: ToastFn;
}) {
  const db = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(!verified);
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stopEditing = useCallback(() => {
    setEditing(false);
    setPending(false);
    setDestination("");
    setCode("");
    setError("");
  }, []);

  const beginEditing = useCallback(() => {
    setEditing(true);
    setPending(false);
    setDestination("");
    setCode("");
    setError("");
  }, []);

  const syncConfirmedContact = useCallback(async () => {
    const current = await db.auth.getSession();
    if (!current.data.session) return false;
    try {
      const status = await syncRecoveryStatus(db);
      if (status.recovery_verified) {
        onVerified(status);
        stopEditing();
        toast("復旧用メールを認証しました");
        return true;
      }
      return false;
    } finally {
      await db.auth.signOut({ scope: "local" }).catch(() => {});
    }
  }, [db, onVerified, stopEditing, toast]);

  // メールリンクから同一ブラウザで戻ってきたケースの自動検出は「初回マウント時の
  // 1回だけ」に限定する。以前は syncConfirmedContact の識別子が変わるたびに再実行
  // され（onVerified が毎描画で新しい関数のため）、メアド変更中のパスキー再認証で
  // 一瞬張られるセッションを拾って、「古いメールで既に verified」を根拠に新コード
  // 入力前に完了扱いしてエディタを閉じてしまっていた（認証済みアカウント特有のバグ）。
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current) return;
    autoSynced.current = true;
    void syncConfirmedContact();
    // 初回のみ実行する。deps に入れると上記の誤再実行が復活するため意図的に除外。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendConfirmation() {
    const value = destination.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      await onReauthenticate();
      const result = await db.auth.updateUser(
        { email: value },
        { emailRedirectTo: "https://via-mi.com/?tab=settings" },
      );
      if (result.error) throw result.error;
      await db.auth.signOut({ scope: "local" });
      setPending(true);
      toast("確認メールを送信しました");
    } catch (error) {
      const status = (error as { status?: number }).status;
      setError(
        status === 429
          ? "送信回数が多すぎます。1分ほど待ってからもう一度お試しください"
          : "送信できませんでした。メールアドレスをご確認ください",
      );
      await db.auth.signOut({ scope: "local" }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function verifyConfirmation() {
    setBusy(true);
    setError("");
    try {
      const otpResult = await db.auth.verifyOtp({
        email: destination.trim(),
        token: code.trim(),
        type: "email_change",
      });
      if (otpResult.error) throw otpResult.error;
      const status = await syncRecoveryStatus(db);
      if (status.recovery_verified) {
        onVerified(status);
        stopEditing();
        toast("復旧用メールを認証しました");
      } else {
        setError("コードが正しくありません");
      }
    } catch {
      setError("コードが正しくありません");
    } finally {
      await db.auth.signOut({ scope: "local" }).catch(() => {});
      setBusy(false);
    }
  }

  const editor = editing && (
    <div className="recoveryEditor">
      {!pending ? (
        <>
          <label className="f" htmlFor="recovery-destination">{verified ? "新しいメールアドレス" : "メールアドレス"}</label>
          <input
            id="recovery-destination"
            type="email"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <button className="btn sig" disabled={busy || !destination.trim()} onClick={sendConfirmation}>
            {busy ? "送信中…" : "確認メールを送る"}
          </button>
        </>
      ) : (
        <>
          <div className="lead">新しいメールアドレスに届いた6桁の確認コードを入力してください。</div>
          <label className="f" htmlFor="recovery-code">確認コード</label>
          <input
            id="recovery-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            maxLength={6}
          />
          <button className="btn sig" disabled={busy || code.length < 6} onClick={verifyConfirmation}>
            {busy ? "確認中…" : "コードで認証する"}
          </button>
        </>
      )}
      {verified && <button className="textlink" type="button" onClick={stopEditing}>キャンセル</button>}
      {error && <div className="hint no">{error}</div>}
    </div>
  );

  if (verified) {
    return (
      <div className="recoveryCard verified">
        <div className="recoveryState"><span aria-hidden="true">✓</span> 復旧用メールを認証済み</div>
        {emailMasked && (
          <div className="verifiedContacts">
            <div className="verifiedContactRow">
              <div><span>メール</span><strong>{emailMasked}</strong></div>
              <button type="button" onClick={beginEditing}>変更</button>
            </div>
          </div>
        )}
        {!editing && !emailMasked && (
          <div className="recoveryAddActions"><button type="button" onClick={beginEditing}>メールを追加</button></div>
        )}
        {editor}
      </div>
    );
  }

  return (
    <div className="recoveryCard">
      <div className="recoveryState warning">復旧用メールが未認証です</div>
      <div className="lead">
        パスキーが使えない場合に備えて、
        <br />
        復旧用のメールアドレスを追加してください。
      </div>
      {editor}
    </div>
  );
}
