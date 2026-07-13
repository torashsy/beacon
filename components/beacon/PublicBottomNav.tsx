import Link from "next/link";

const items = [
  ["profile", "プロフィール", "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"],
  ["follows", "フォロー中", "M6 4h12a2 2 0 0 1 2 2v14l-8-4-8 4V6a2 2 0 0 1 2-2Z"],
  ["howto", "使い方", "M9.1 9a3 3 0 1 1 4.3 2.7c-.9.5-1.4 1.1-1.4 2.3M12 18h.01"],
  ["settings", "設定", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.5 1.5m-9 9L6 18m12 0-1.5-1.5m-9-9L6 6"],
] as const;

export function PublicBottomNav() {
  return (
    <nav className="nav" aria-label="メインナビゲーション">
      {items.map(([tab, label, path]) => (
        <Link key={tab} className="ni" href={`/?tab=${tab}`}>
          <svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={path} />
          </svg>
          {label}
        </Link>
      ))}
    </nav>
  );
}
