"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncRecoveryStatus, type RecoveryStatus } from "@/lib/beacon/rpc";
import type { ToastFn } from "./appTypes";
import { normalizePhoneNumber } from "@/lib/beacon/phone";
import { PhoneNumberFields } from "./PhoneNumberFields";

type Method = "email" | "phone";

export function RecoverySetup({
  verified,
  emailMasked,
  phoneMasked,
  onReauthenticate,
  onVerified,
  toast,
}: {
  verified: boolean;
  emailMasked: string | null;
  phoneMasked: string | null;
  onReauthenticate: () => Promise<void>;
  onVerified: (status: RecoveryStatus) => void;
  toast: ToastFn;
}) {
  const db = useMemo(() => createClient(), []);
  const [method, setMethod] = useState<Method>("email");
  const [editingMethod, setEditingMethod] = useState<Method | null>(verified ? null : "email");
  const [destination, setDestination] = useState("");
  const [countryCode, setCountryCode] = useState("81");
  const [nationalNumber, setNationalNumber] = useState("");
  const [pending, setPending] = useState<{ method: Method; destination: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const normalizedPhone = normalizePhoneNumber(countryCode, nationalNumber);

  const stopEditing = useCallback(() => {
    setEditingMethod(null);
    setPending(null);
    setDestination("");
    setCountryCode("81");
    setNationalNumber("");
    setCode("");
    setError("");
  }, []);

  const beginEditing = useCallback((nextMethod: Method) => {
    setMethod(nextMethod);
    setEditingMethod(nextMethod);
    setPending(null);
    setDestination("");
    setCountryCode("81");
    setNationalNumber("");
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
        toast("復旧手段を認証しました");
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

  async function sendCode() {
    if (!editingMethod) return;
    const value = editingMethod === "email" ? destination.trim() : normalizedPhone;
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      await onReauthenticate();
      const result = editingMethod === "email"
        ? await db.auth.updateUser({ email: value }, { emailRedirectTo: "https://via-mi.com/?tab=settings" })
        : await db.auth.updateUser({ phone: value });
      if (result.error) throw result.error;
      await db.auth.signOut({ scope: "local" });
      setPending({ method: editingMethod, destination: value });
      setCode("");
      toast(editingMethod === "email" ? "確認メールを送信しました" : "確認コードを送信しました");
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
      const result = await db.auth.verifyOtp({
        phone: pending.destination,
        token: code.trim(),
        type: "phone_change",
      });
      if (result.error) throw result.error;
      const status = await syncRecoveryStatus(db);
      onVerified(status);
      stopEditing();
      toast("復旧手段を認証しました");
      await db.auth.signOut({ scope: "local" });
    } catch {
      setError("確認コードが違うか、期限が切れています");
    } finally {
      setBusy(false);
    }
  }

  const editor = editingMethod && (
    <div className="recoveryEditor">
      {editingMethod === "email" ? (
        <>
          <label className="f" htmlFor="recovery-destination">新しいメールアドレス</label>
          <input
            id="recovery-destination"
            type="email"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </>
      ) : (
        <PhoneNumberFields
          idPrefix="recovery-phone"
          countryCode={countryCode}
          nationalNumber={nationalNumber}
          onCountryCodeChange={setCountryCode}
          onNationalNumberChange={setNationalNumber}
        />
      )}
      {!pending ? (
        <button
          className="btn sig"
          disabled={busy || !(editingMethod === "email" ? destination.trim() : normalizedPhone)}
          onClick={sendCode}
        >
          {busy ? "送信中…" : editingMethod === "email" ? "確認メールを送る" : "確認コードを送る"}
        </button>
      ) : pending.method === "email" ? (
        <>
          <div className="lead">新しいメールアドレスに届いた確認リンクを開いてください。</div>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void syncConfirmedContact()}>
            認証状態を確認
          </button>
        </>
      ) : (
        <>
          <div className="lead">新しい電話番号に届いた確認コードを入力してください。</div>
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
        </>
      )}
      {verified && <button className="textlink" type="button" onClick={stopEditing}>キャンセル</button>}
      {error && <div className="hint no">{error}</div>}
    </div>
  );

  if (verified) {
    return (
      <div className="recoveryCard verified">
        <div className="recoveryState"><span aria-hidden="true">✓</span> 復旧手段を認証済み</div>
        <div className="verifiedContacts">
          {emailMasked && (
            <div className="verifiedContactRow">
              <div><span>メール</span><strong>{emailMasked}</strong></div>
              <button type="button" onClick={() => beginEditing("email")}>変更</button>
            </div>
          )}
          {phoneMasked && (
            <div className="verifiedContactRow">
              <div><span>電話番号</span><strong>{phoneMasked}</strong></div>
              <button type="button" onClick={() => beginEditing("phone")}>変更</button>
            </div>
          )}
        </div>
        {!editingMethod && (
          <div className="recoveryAddActions">
            {!emailMasked && <button type="button" onClick={() => beginEditing("email")}>メールを追加</button>}
            {!phoneMasked && <button type="button" onClick={() => beginEditing("phone")}>電話番号を追加</button>}
          </div>
        )}
        {editor}
        <div className="lead recoveryPrivacyNote">連絡先は本人の設定画面にだけ表示されます。</div>
      </div>
    );
  }

  return (
    <div className="recoveryCard">
      <div className="recoveryState warning">復旧手段が未認証です</div>
      <div className="lead">パスキーを失った場合に備えて、あとから復旧できる連絡先を追加してください。</div>
      <div className="methodTabs" role="tablist" aria-label="認証方法">
        <button type="button" className={method === "email" ? "on" : ""} onClick={() => beginEditing("email")}>メール</button>
        <button type="button" className={method === "phone" ? "on" : ""} onClick={() => beginEditing("phone")}>電話番号</button>
      </div>
      {editor}
    </div>
  );
}
