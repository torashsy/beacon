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

/** リンクのサムネイル（img_url があれば画像、無ければ種別バッジ）。 */
export function LinkThumb({ type, img }: { type: string; img?: string }) {
  if (img) {
    return (
      <span className="ic-badge" style={{ padding: 0, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </span>
    );
  }
  return <TypeBadge type={type} />;
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
