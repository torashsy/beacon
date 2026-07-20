"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  registerPushSubscription,
  unregisterPushSubscription,
  vapidApplicationServerKey,
} from "@/lib/beacon/push";
import type { ToastFn } from "./appTypes";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

function pushSupported() {
  return typeof Notification !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && window.isSecureContext;
}

export function PushNotificationSetting({
  handle,
  secret,
  toast,
}: {
  handle: string;
  secret: string;
  toast: ToastFn;
}) {
  const db = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!pushSupported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe().catch(() => false);
          await unregisterPushSubscription(db, handle, secret, subscription.endpoint).catch(() => {});
        }
        if (!cancelled) setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (cancelled) return;
      if (subscription && Notification.permission === "granted") {
        setState("on");
        void registerPushSubscription(db, handle, secret, subscription).catch(() => {});
      } else {
        setState("off");
      }
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });
    return () => { cancelled = true; };
  }, [db, handle, secret]);

  async function enable() {
    setBusy(true);
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        toast("通知は許可されませんでした");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidApplicationServerKey(),
      });
      try {
        await registerPushSubscription(db, handle, secret, subscription);
      } catch (error) {
        if (!existing) await subscription.unsubscribe().catch(() => false);
        throw error;
      }
      setState("on");
      toast("更新通知をオンにしました");
    } catch {
      toast("通知を設定できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unregisterPushSubscription(db, handle, secret, subscription.endpoint);
        await subscription.unsubscribe();
      }
      const badge = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      await badge.clearAppBadge?.().catch(() => {});
      setState("off");
      toast("更新通知をオフにしました");
    } catch {
      toast("通知設定を変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const enabled = state === "on";
  const description = state === "unsupported"
    ? "この端末では利用できません。iPhoneはホーム画面版から設定してください。"
    : state === "denied"
      ? "端末の設定でvia-miの通知を許可してください。"
      : enabled
        ? "フォロー中の相手が更新すると、この端末に通知します。"
        : "フォローしたユーザーの更新を、プッシュ通知で受け取れます。";

  return (
    <div className="pushSetting">
      <div className="pushSettingText">
        <strong>更新通知</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        className={`switchButton ${enabled ? "on" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label="更新通知"
        disabled={busy || state === "loading" || state === "unsupported" || state === "denied"}
        onClick={() => void (enabled ? disable() : enable())}
      >
        <span />
      </button>
    </div>
  );
}
