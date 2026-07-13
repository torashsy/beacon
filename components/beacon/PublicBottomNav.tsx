import Link from "next/link";

const items = [
  ["follows", "Follow", "M6 4h12a2 2 0 0 1 2 2v14l-8-4-8 4V6a2 2 0 0 1 2-2Z"],
  ["profile", "me", "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"],
  ["help", "Help", "M9.1 9a3 3 0 1 1 4.3 2.7c-.9.5-1.4 1.1-1.4 2.3M12 18h.01"],
] as const;

export function PublicBottomNav() {
  return (
    <nav className="nav" aria-label="メインナビゲーション">
      {items.map(([tab, label, path]) => (
        <Link key={tab} className="ni" href={`/?tab=${tab}`} aria-label={label}>
          <svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={path} />
          </svg>
        </Link>
      ))}
    </nav>
  );
}
