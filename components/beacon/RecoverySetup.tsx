"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncRecoveryStatus, type AccountSecurity } from "@/lib/beacon/rpc";
import type { ToastFn } from "./appTypes";

type Method = "email" | "phone";

export function RecoverySetup({
  verified,
  kind,
  onReauthenticate,
  onVerified,
  toast,
}: {
  verified: boolean;
  kind: AccountSecurity["recovery_kind"];
  onReauthenticate: () => Promise<void>;
  onVerified: (status: Pick<AccountSecurity, "recovery_verified" | "recovery_kind">) => void;
  toast: ToastFn;
}) {
  const db = useMemo(() => createClient(), []);
  const [method, setMethod] = useState<Method>("email");
  const [destination, setDestination] = useState("");
  const [pending, setPending] = useState<{ method: Method; destination: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const syncConfirmedContact = useCallback(async () => {
    const current = await db.auth.getSession();
    if (!current.data.session) return false;
    try {
      const status = await syncRecoveryStatus(db);
      if (status.recovery_verified) {
        onVerified(status);
        toast("復旧手段を認証しました");
        return true;
      }
      return false;
    } finally {
      await db.auth.signOut({ scope: "local" }).catch(() => {});
    }
  }, [db, onVerified, toast]);

  useEffect(() => {
    void syncConfirmedContact();
  }, [syncConfirmedContact]);

  async function sendCode() {
    const value = destination.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      await onReauthenticate();
      const result = method === "email"
        ? await db.auth.updateUser({ email: value }, { emailRedirectTo: "https://via-mi.com/?tab=settings" })
        : await db.auth.updateUser({ phone: value });
      if (result.error) throw result.error;
      await db.auth.signOut({ scope: "local" });
      setPending({ method, destination: value });
      setCode("");
      toast(method === "email" ? "確認メールを送信しました" : "確認コードを送信しました");
    } catch (cause) {
      const message = String((cause as { message?: string })?.message ?? cause);
      setError(message.includes("phone provider") || message.includes("Unsupported phone")
        ? "電話認証は現在利用できません。メール認証をお使いください"
        : "送信できませんでした。入力内容をご確認ください");
      await db.auth.signOut({ scope: "local" }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!pending || code.trim().length < 6) return;
    setBusy(true);
    setError("");
    try {
      const result = pending.method === "email"
        ? await db.auth.verifyOtp({ email: pending.destination, token: code.trim(), type: "email_change" })
        : await db.auth.verifyOtp({ phone: pending.destination, token: code.trim(), type: "phone_change" });
      if (result.error) throw result.error;
      const status = await syncRecoveryStatus(db);
      onVerified(status);
      setPending(null);
      setDestination("");
      setCode("");
      toast("復旧手段を認証しました");
      await db.auth.signOut({ scope: "local" });
    } catch {
      setError("確認コードが違うか、期限が切れています");
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <div className="recoveryCard verified">
        <div className="recoveryState"><span aria-hidden="true">✓</span> 復旧手段を認証済み</div>
        <div className="lead">{kind === "phone" ? "電話番号" : kind === "email+phone" ? "メール・電話番号" : "メールアドレス"}で復旧できます。</div>
      </div>
    );
  }

  return (
    <div className="recoveryCard">
      <div className="recoveryState warning">復旧手段が未認証です</div>
      <div className="lead">パスキーを失った場合に備えて、あとから復旧できる連絡先を追加してください。</div>
      <div className="methodTabs" role="tablist" aria-label="認証方法">
        <button type="button" className={method === "email" ? "on" : ""} onClick={() => setMethod("email")}>メール</button>
        <button type="button" className={method === "phone" ? "on" : ""} onClick={() => setMethod("phone")}>電話番号</button>
      </div>
      {!pending ? (
        <>
          <label className="f" htmlFor="recovery-destination">{method === "email" ? "メールアドレス" : "電話番号（国番号付き）"}</label>
          <input
            id="recovery-destination"
            type={method === "email" ? "email" : "tel"}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder={method === "email" ? "you@example.com" : "+819012345678"}
            autoComplete={method === "email" ? "email" : "tel"}
          />
          <button className="btn sig" disabled={busy || !destination.trim()} onClick={sendCode}>
            {busy ? "送信中…" : method === "email" ? "確認メールを送る" : "確認コードを送る"}
          </button>
        </>
      ) : pending.method === "email" ? (
        <>
          <div className="lead">メール内の確認リンクを開いてください。確認後、この画面に戻ると反映されます。</div>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void syncConfirmedContact()}>
            認証状態を確認
          </button>
          <button className="textlink" type="button" onClick={() => setPending(null)}>メールアドレスを入力し直す</button>
        </>
      ) : (
        <>
          <div className="lead">{pending.destination} に届いた確認コードを入力してください。</div>
          <label className="f" htmlFor="recovery-code">確認コード</label>
          <input
            id="recovery-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="6桁のコード"
          />
          <button className="btn sig" disabled={busy || code.length < 6} onClick={verifyCode}>
            {busy ? "確認中…" : "認証する"}
          </button>
          <button className="textlink" type="button" onClick={() => setPending(null)}>入力し直す</button>
        </>
      )}
      {error && <div className="hint no">{error}</div>}
    </div>
  );
}
