import { iconPath, typeMeta } from "@/lib/beacon/constants";

// beacon.html の icBadge / vbadge / カメラアイコンを React コンポーネント化。
// SVG のパスは constants の信頼できる静的文字列を dangerouslySetInnerHTML で描画する。

/** リンク種別の色付き角丸バッジ（内部に白の SVG アイコン）。 */
export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="ic-badge" style={{ background: typeMeta(type).bg }}>
      <svg
        viewBox="0 0 24 24"
        // 静的な定数のみ。ユーザー入力は含まれない。
        dangerouslySetInnerHTML={{ __html: iconPath(type) }}
      />
    </span>
  );
}

/** リンク種別のアイコン。 */
export function LinkThumb({ type }: { type: string }) {
  return <TypeBadge type={type} />;
}

export type FeatureIconName = "link" | "key" | "calendar" | "book";

const FEATURE_ICON_PATHS: Record<FeatureIconName, string> = {
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  calendar: "M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2Zm2-2v4m10-4v4M3 9h18m-9 3v5m-2.5-2.5h5",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zm20 0h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
};

/** 絵文字の代わりに使う、線画スタイルのSVGアイコン。 */
export function FeatureIcon({ name }: { name: FeatureIconName }) {
  return (
    <svg className="inlineIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={FEATURE_ICON_PATHS[name]} />
    </svg>
  );
}

/** 画像変更用カメラアイコン（編集オーバーレイ内）。 */
export function CameraIcon() {
  return (
    <span className="cambtn">
      <svg viewBox="0 0 24 24">
        <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 3l-1.8 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 15a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" />
      </svg>
    </span>
  );
}
