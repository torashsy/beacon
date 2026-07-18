export type NavIconName = "profile" | "follows" | "help";

const NAV_ICON_PATHS: Record<NavIconName, string> = {
  profile: "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z",
  follows:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  help:
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.1 9a3 3 0 1 1 4.3 2.7c-.9.5-1.4 1.1-1.4 2.3M12 18h.01",
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg className="navIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={NAV_ICON_PATHS[name]} />
    </svg>
  );
}
