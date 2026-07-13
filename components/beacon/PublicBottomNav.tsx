import Link from "next/link";

const items = [
  ["follows", "Follow", "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"],
  ["profile", "me", "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z"],
  ["help", "Help", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.1 9a3 3 0 1 1 4.3 2.7c-.9.5-1.4 1.1-1.4 2.3M12 18h.01"],
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
