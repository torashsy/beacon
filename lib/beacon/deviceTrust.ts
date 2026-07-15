/**
 * 「この端末を信頼する」機能（セッション方式aへの任意アドオン）。
 * 既定ではパスコードは一切保存せずリロードのたび再入力させる（方式a）。
 * これは不便だと感じるユーザーのための opt-in 機能で、Web Crypto (AES-GCM) で
 * 生成した端末限定鍵でパスコードを暗号化し localStorage に置く。
 *
 * 重要な限界: 鍵も同じ localStorage に置くため、これは「他人が devtools を覗いても
 * 平文パスコードが一目で見えない」程度の難読化であり、XSS など localStorage への
 * スクリプトアクセスからは守れない。それでも「タブを閉じるたびに毎回入力」より
 * 現実的な利便性を提供するトレードオフとして、ユーザーの明示的な同意（チェック
 * ボックス）がある場合のみ有効にする。
 */

const K_TRUST = "via-mi:trust:v1";

interface TrustBlob {
  handle: string;
  iv: string; // base64
  key: string; // base64（raw AES-GCM鍵）
  data: string; // base64（暗号文）
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function isTrustSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.crypto?.subtle &&
    !!window.localStorage
  );
}

/** 指定ハンドル・パスコードをこの端末に信頼保存する。 */
export async function trustDevice(handle: string, pass: string): Promise<void> {
  if (!isTrustSupported()) return;
  try {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(pass),
    );
    const rawKey = await crypto.subtle.exportKey("raw", key);
    const blob: TrustBlob = {
      handle: handle.toLowerCase(),
      iv: toB64(iv.buffer),
      key: toB64(rawKey),
      data: toB64(data),
    };
    window.localStorage.setItem(K_TRUST, JSON.stringify(blob));
  } catch {
    /* 対応していない/失敗した場合は黙って信頼保存を諦める（必須機能ではないため） */
  }
}

/** 信頼済みセッションを読み出す。無い/壊れている/復号失敗なら null。 */
export async function getTrustedSession(): Promise<
  { handle: string; pass: string } | null
> {
  if (!isTrustSupported()) return null;
  try {
    const raw = window.localStorage.getItem(K_TRUST);
    if (!raw) return null;
    const blob = JSON.parse(raw) as TrustBlob;
    const key = await crypto.subtle.importKey(
      "raw",
      fromB64(blob.key) as BufferSource,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(blob.iv) as BufferSource },
      key,
      fromB64(blob.data) as BufferSource,
    );
    return { handle: blob.handle, pass: new TextDecoder().decode(plain) };
  } catch {
    return null;
  }
}

export function clearTrustedDevice(): void {
  try {
    window.localStorage.removeItem(K_TRUST);
  } catch {
    /* noop */
  }
}
