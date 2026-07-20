"use client";

import { useState } from "react";

/** 折りたたみが必要そうな長さ（文字数）。 */
const COLLAPSE_LENGTH = 90;
/** 折りたたみ時の最大行数（CSSの -webkit-line-clamp と合わせる）。 */
const COLLAPSE_LINES = 4;

function needsCollapse(bio: string): boolean {
  const lineBreaks = (bio.match(/\n/g) ?? []).length;
  return bio.length > COLLAPSE_LENGTH || lineBreaks >= COLLAPSE_LINES - 1;
}

/** 長い自己紹介文でリンク一覧が下に押し出されないよう、途中で折りたたむ。 */
export function CollapsibleBio({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = needsCollapse(bio);

  return (
    <div className="xbio">
      <div className={collapsible && !expanded ? "xbioText clamped" : "xbioText"}>
        {bio}
      </div>
      {collapsible && (
        <button
          type="button"
          className="xbioToggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "閉じる" : "続きを読む"}
        </button>
      )}
    </div>
  );
}
