"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stopEditing = useCallback(() => {
    setEditing(false);
    setPending(false);
    setDestination("");
    setError("");
  }, []);

  const beginEditing = useCallback(() => {
    setEditing(true);
    setPending(false);
    setDestination("");
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

  useEffect(() => {
    void syncConfirmedContact();
  }, [syncConfirmedContact]);

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
    } catch {
      setError("送信できませんでした。メールアドレスをご確認ください");
      await db.auth.signOut({ scope: "local" }).catch(() => {});
    } finally {
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
          <div className="lead">新しいメールアドレスに届いた確認リンクを開いてください。</div>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void syncConfirmedContact()}>
            認証状態を確認
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
        <div className="lead recoveryPrivacyNote">メールアドレスは本人の設定画面にだけ表示されます。</div>
      </div>
    );
  }

  return (
    <div className="recoveryCard">
      <div className="recoveryState warning">復旧用メールが未認証です</div>
      <div className="lead">パスキーを失った場合に備えて、復旧できるメールアドレスを追加してください。</div>
      {editor}
    </div>
  );
}
