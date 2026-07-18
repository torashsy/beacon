import Link from "next/link";
import { NavIcon } from "./NavIcon";

const items = [
  ["follows", "Follow"],
  ["profile", "me"],
  ["help", "Help"],
] as const;

export function PublicBottomNav() {
  return (
    <nav className="nav" aria-label="メインナビゲーション">
      {items.map(([tab, label]) => (
        <Link key={tab} className="ni" href={`/?tab=${tab}`} aria-label={label}>
          <NavIcon name={tab} />
        </Link>
      ))}
    </nav>
  );
}
