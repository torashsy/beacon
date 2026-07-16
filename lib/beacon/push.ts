import type { SupabaseClient } from "@supabase/supabase-js";

export const VAPID_PUBLIC_KEY =
  "BIN-yX32MTR125T6rNgUw1ne6Xt0hjFqWrGfx_ZXHMDMHpBulJIBBsbTTFCARa5nj5iEK3f7yB71bav1-WhX1C0";

type DB = SupabaseClient;

function unwrap(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

export function vapidApplicationServerKey(value = VAPID_PUBLIC_KEY): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = globalThis.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export async function registerPushSubscription(
  db: DB,
  handle: string,
  secret: string,
  subscription: PushSubscription,
): Promise<void> {
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!serialized.endpoint || !p256dh || !auth) throw new Error("invalid push subscription");
  unwrap(await db.rpc("save_push_subscription", {
    p_handle: handle,
    p_secret: secret,
    p_endpoint: serialized.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  }));
}

export async function unregisterPushSubscription(
  db: DB,
  handle: string,
  secret: string,
  endpoint: string,
): Promise<void> {
  unwrap(await db.rpc("delete_push_subscription", {
    p_handle: handle,
    p_secret: secret,
    p_endpoint: endpoint,
  }));
}

export async function removeCurrentDevicePushSubscription(
  db: DB,
  handle: string,
  secret: string,
): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await subscription.unsubscribe().catch(() => false);
  await unregisterPushSubscription(db, handle, secret, subscription.endpoint).catch(() => {});
}

export async function notifyFollowers(
  db: DB,
  handle: string,
  secret: string,
): Promise<void> {
  const { error } = await db.functions.invoke("send-follow-update", {
    body: { handle, secret },
  });
  if (error) throw error;
}
