/**
 * この端末で使った Beacon の ID 一覧（複数プロフィールの切替用）。
 * パスコードは保存しない（方式a）。ハンドルだけを控え、切替時は再ログインさせる。
 * 別ハンドル＝完全に独立した公開ページ（/@work, /@hobby）。スキーマ変更は不要。
 */

const K_HANDLES = "beacon:handles:v1";

export function loadHandles(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(K_HANDLES);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list: string[]): void {
  try {
    window.localStorage.setItem(K_HANDLES, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

/** 使ったハンドルを控える（先頭 = 最近）。 */
export function addHandle(handle: string): string[] {
  const h = handle.toLowerCase();
  const list = [h, ...loadHandles().filter((x) => x !== h)];
  persist(list);
  return list;
}

export function removeHandle(handle: string): string[] {
  const list = loadHandles().filter((x) => x !== handle.toLowerCase());
  persist(list);
  return list;
}
