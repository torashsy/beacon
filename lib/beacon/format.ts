// 表示整形と入力サニタイズのユーティリティ。beacon.html の同名関数を移植。

/** 相対時刻。beacon.html の ago() 相当。 */
export function ago(ts: number): string {
  const t = (Date.now() - ts) / 1000;
  if (t < 60) return "たった今";
  if (t < 3600) return Math.floor(t / 60) + "分前";
  if (t < 86400) return Math.floor(t / 3600) + "時間前";
  return Math.floor(t / 86400) + "日前";
}

/** ハンドルのサニタイズ。英数と _ のみ・小文字化。beacon.html の cleanH。 */
export function cleanHandle(x: string): string {
  return x.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

/** YYYY-MM-DD キー生成（ローカル日付）。 */
export function dkey(y: number, m: number, d: number): string {
  return (
    y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0")
  );
}

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" → "M/D(曜)" 表示。 */
export function fmtMd(k: string): string {
  const [y, m, d] = k.split("-").map(Number);
  const dow = DOW_JA[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${dow})`;
}

/** 復旧コードの入力を正規化（空白・ハイフン除去 → 大文字）。 */
export function normalizeRecoveryCode(x: string): string {
  return x.replace(/[\s-]/g, "").toUpperCase();
}
