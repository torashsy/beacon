/**
 * ログイン状態の保持（X/Instagram等と同じセッショントークン方式）。
 * パスコードそのものは端末に保存せず、サーバーが発行した失効可能なトークン
 * （'bst_'+64桁hex・30日スライド期限・サーバー側で削除可能）だけを
 * localStorage に置く。_check_pass がトークンも受けるため、既存RPCには
 * トークンをそのまま pass として渡せる。
 *
 * 旧「この端末を信頼する」(deviceTrust) はパスコード自体を難読化保存する
 * 方式だったため、起動時に一度だけこの方式へ移行して破棄する（BeaconApp参照）。
 */

const K_SESSION = "via-mi:session:v1";
const SESSION_TOKEN_RE = /^bst_[0-9a-f]{64}$/;

export interface StoredSession {
  handle: string;
  token: string;
}

export function loadStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(K_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return /^[a-z0-9_]{3,20}$/.test(s.handle) && SESSION_TOKEN_RE.test(s.token)
      ? s
      : null;
  } catch {
    return null;
  }
}

export function storeSession(handle: string, token: string): void {
  try {
    window.localStorage.setItem(
      K_SESSION,
      JSON.stringify({ handle: handle.toLowerCase(), token }),
    );
  } catch {
    /* ストレージ不可なら保持なし（メモリログインのみ）で動く */
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(K_SESSION);
  } catch {
    /* noop */
  }
}

/** 渡された秘密情報がセッショントークンか（パスコードかを区別する）。 */
export function isSessionToken(secret: string): boolean {
  return SESSION_TOKEN_RE.test(secret);
}
